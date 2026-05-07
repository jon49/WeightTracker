const {
  globalDb: db,
  db: { getMany, setMany, set, update },
} = self.sw;

const SYNC_URL = "/api/data/weight";
const REFRESH_URL = "/api/auth/v1/refresh";

export default async function sync() {
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

  let toSaveNewData = [];
  for (let saved of newData.data) {
    let key = parse(saved.key);
    let data = parse(saved.data);
    data._rev = saved.id;
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
    update("updated", (val) => (val?.clear(), val), { sync: false }),
  ]);

  if (toSaveNewData.length > 0) {
    return { status: 200 };
  }
  return { status: 204 };
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
