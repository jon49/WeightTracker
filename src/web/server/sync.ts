import type { UserSettings } from "./db.js";

const {
  globalDb: db,
  db: { get, getMany, setMany, set, update },
} = self.sw;

const SYNC_URL = "/api/data/weight";
const REFRESH_URL = "/api/auth/v1/refresh";

// `uploadMerge` is false on the follow-up sync that uploads merged user
// settings, so a sync never repeats more than once.
export default async function sync(uploadMerge = true): Promise<{ status: number }> {
  let tokens = await db.authTokens();
  if (!tokens) {
    await db.setLoggedIn(false);
    return { status: 401 };
  }

  let keys = await db.updated();
  const items = await getMany(keys);
  const data: Data[] = new Array(keys.length);
  for (let index = 0; index < items.length; index++) {
    let key = keys[index];
    let d = items[index];
    data[index] = { key, data: d, id: d._rev ?? 0 };
  }
  const lastSyncedId = (await db.settings()).lastSyncedId ?? 0;

  let postData: PostData = { lastSyncedId, data };
  let res = await postSync(postData, tokens.auth_token);

  // TrailBase may have a stale auth token (1h TTL by default). Refresh once.
  if (res.status === 401 && tokens.refresh_token) {
    let refreshed = await refreshAuthToken(tokens.refresh_token);
    if (refreshed) {
      await db.setAuthTokens({ ...tokens, auth_token: refreshed });
      res = await postSync(postData, refreshed);
    }
  }

  let newData: ResponseData;
  if (
    res.status >= 200 &&
    res.status <= 299 &&
    res.headers.get("Content-Type")?.startsWith("application/json")
  ) {
    newData = await res.json();
  } else {
    if ([401, 403].includes(res.status)) {
      await db.setLoggedIn(false);
      return { status: 401 };
    }
    return { status: res.status };
  }

  // Records edited while the request was in flight are newer than what was
  // sent or received: keep them, and leave them marked for the next sync.
  let editedDuringSync = await changedSince(keys, items);

  let localSettings = await get("user-settings");
  let toSaveNewData = [];
  for (let saved of newData.data) {
    let key = parse(saved.key);
    if (editedDuringSync.has(updatedId(key))) continue;
    let data = parse(saved.data);
    data._rev = saved.id;
    if (key === "user-settings") {
      // Keep entries from before the other device's start date in the history.
      data.earliestDate = earlierDate(data.earliestDate, localSettings?.earliestDate);
    }
    toSaveNewData.push([key, data]);
  }
  await setMany(<any>toSaveNewData);

  let updatedData = await getMany(newData.saved.map((x) => parse(x.key)));
  let updatedRevisionsTask = [];
  for (let index = 0; index < updatedData.length; index++) {
    let d = updatedData[index];
    let { key, id } = newData.saved[index];
    if (d) {
      d._rev = id;
      updatedRevisionsTask.push(set(parse(key), updatedData[index], false));
    } else {
      console.error("Could not find the key to update the revision!", key, id);
    }
  }

  await Promise.all([
    ...updatedRevisionsTask,
    update(
      "settings",
      (val) => ({ ...val, lastSynced: +new Date(), lastSyncedId: newData.lastSyncedId }),
      { sync: false },
    ),
    update(
      "updated",
      (val) => {
        for (let key of keys) {
          let id = updatedId(key);
          if (!editedDuringSync.has(id)) val?.delete(id);
        }
        return val;
      },
      { sync: false },
    ),
  ]);

  let merged = await mergeConflictedUserSettings(newData.conflicted);
  if (merged && uploadMerge) {
    await sync(false);
  }

  if (toSaveNewData.length > 0 || merged) {
    return { status: 200 };
  }
  return { status: 204 };
}

// Another device changed the user settings since this one last synced, and
// the upload above replaced them (last write wins), which would lose, say, a
// height set elsewhere. Keep this device's values, fill in the ones it lacks,
// keep the earlier start date, and mark the merge for upload.
async function mergeConflictedUserSettings(conflicted: ConflictedDto[] | undefined) {
  let remote = (conflicted ?? [])
    .filter((x) => parse(x.key) === "user-settings" && x.data)
    .sort((a, b) => b.id - a.id)[0];
  if (!remote) return false;
  let theirs: Partial<UserSettings> = parse(remote.data) ?? {};
  let ours = await get("user-settings");
  if (!ours) return false;
  let merged: UserSettings = {
    ...ours,
    earliestDate: earlierDate(ours.earliestDate, theirs.earliestDate),
    height: ours.height || theirs.height,
    goalWeight: ours.goalWeight || theirs.goalWeight,
    bedtime: ours.bedtime || theirs.bedtime,
  };
  if (
    merged.earliestDate === ours.earliestDate &&
    merged.height === ours.height &&
    merged.goalWeight === ours.goalWeight &&
    merged.bedtime === ours.bedtime
  ) {
    return false;
  }
  await set("user-settings", merged);
  return true;
}

// changedSince returns the pending keys whose value is not what was sent,
// including keys that were not pending when the sync started.
async function changedSince(sentKeys: (string | number)[], sentItems: any[]) {
  let sent = new Map(sentKeys.map((key, i) => [updatedId(key), JSON.stringify(sentItems[i])]));
  let pending = await db.updated();
  let current = await getMany(pending);
  let changed = new Set<IDBValidKey>();
  pending.forEach((key, i) => {
    let id = updatedId(key);
    if (sent.get(id) !== JSON.stringify(current[i])) changed.add(id);
  });
  return changed;
}

// updatedId is how a key is stored in the "updated" set (see db.ts).
function updatedId(key: unknown): IDBValidKey {
  return Array.isArray(key) ? JSON.stringify(key) : (key as IDBValidKey);
}

// Dates are YYYY-MM-DD, so they compare as strings.
function earlierDate(a: string | undefined, b: string | undefined) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function postSync(body: PostData, authToken: string) {
  return fetch(SYNC_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    keepalive: true,
    credentials: "same-origin",
    mode: "same-origin",
  });
}

async function refreshAuthToken(refreshToken: string): Promise<string | null> {
  try {
    let res = await fetch(REFRESH_URL, {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      mode: "same-origin",
    });
    if (!res.ok) return null;
    let json = await res.json();
    return typeof json?.auth_token === "string" ? json.auth_token : null;
  } catch {
    return null;
  }
}

function parse(value: any) {
  return typeof value === "string" && ["{", "[", `"`].includes(value[0])
    ? JSON.parse(value)
    : value;
}

interface Data {
  key: any;
  data: any;
  id: number;
}

interface PostData {
  lastSyncedId: number;
  data: Data[];
}

interface ResponseData {
  data: Data[];
  saved: SavedDto[];
  conflicted: ConflictedDto[];
  lastSyncedId: number;
}

interface SavedDto {
  key: string;
  id: number;
}

interface ConflictedDto {
  key: string;
  data?: string;
  id: number;
  timestamp: string;
}
