// Deleting the user's account. TrailBase's `DELETE /api/auth/v1/delete`
// removes the account and its sessions, and ImageBase's triggers remove the
// data it synced (see ../ImageBase README, "Deleting an account").
import { refreshAuthToken } from "./sync.js";

const {
  globalDb: db,
  db: { clear },
  syncQueue: { afterSync },
} = self.sw;

const DELETE_URL = "/api/auth/v1/delete";

// deleteAccount deletes the account on the server and then everything this
// device holds, keeping only the theme. It waits for a sync in flight, so
// that sync can't write data back afterwards. Returns the server's status
// (0 when offline).
export function deleteAccount(): Promise<number> {
  return afterSync(async () => {
    let tokens = await db.authTokens();
    if (!tokens) return 401;
    let res = await deleteWithToken(tokens.auth_token);
    // TrailBase's auth token may be stale (1h TTL by default). Refresh once.
    if (res.status === 401 && tokens.refresh_token) {
      let refreshed = await refreshAuthToken(tokens.refresh_token);
      if (refreshed) {
        await db.setAuthTokens({ ...tokens, auth_token: refreshed });
        res = await deleteWithToken(refreshed);
      }
    }
    if (!res.ok) return res.status;
    let { theme } = await db.settings();
    await clear();
    if (theme) await db.setTheme(theme);
    return res.status;
  });
}

// A network error is `Response.error()`, whose status is 0.
function deleteWithToken(authToken: string) {
  return fetch(DELETE_URL, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
    credentials: "same-origin",
    mode: "same-origin",
  }).catch(() => Response.error());
}
