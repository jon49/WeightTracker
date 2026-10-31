import type { UserSettings, Settings } from "../../server/db.js";
import type { RoutePage, RoutePostHandler } from "@jon49/sw/routes.middleware.js";
import { deleteAccount } from "../../server/account.js";

const {
  db,
  globalDb,
  html,
  layout,
  page: { loginView },
  utils: { formatNumber },
  validation: { createDateString, createTimeString, createPositiveNumber, maybe, validateObject },
} = self.sw;

async function render() {
  let [userSettings, settings, loggedIn] = await Promise.all([
    db.get("user-settings"),
    db.get("settings"),
    globalDb.isLoggedIn(),
  ]);
  let { earliestDate, height, goalWeight, bedtime } = userSettings ?? <UserSettings>{};
  settings = settings ?? ({} as Settings);

  return html`
<h2>User Settings</h2>

<form method=post action="?handler=clearData" target=htmz>
<button>Clear All Data</button>
</form>

<form method=post action="?handler=userSettings" onchange="this.submit()" target=htmz>
    <input name=earliestDate type=hidden value="${earliestDate}">
    <div class=grid>
        <label>Height (inches):
            <input name=height type=number step=any value="${height ? formatNumber(height) : null}">
        </label>
        <label>Goal Weight:
            <input name=goalWeight type=number step=any value="${goalWeight ? formatNumber(goalWeight) : null}">
        </label>
    </div>
    <label>
        Bedtime:
        <input name=bedtime type=time value="${bedtime}">
    </label>
</form>

${accountView(loggedIn)}`;
}

// accountView: deleting the account, while logged in.
function accountView(loggedIn: boolean) {
  if (!loggedIn)
    return html`
      <div id="account"></div>
    `;
  return html`
    <section id="account" class="danger-zone">
      <h3>Delete account</h3>
      <p>
        Permanently deletes your account and the entries and settings you've synced, from the server and
        from this device. This can't be undone.
      </p>
      <p>
        Other devices you use this app on keep their own copy of your data. They are logged out the next
        time they sync, but you'll need to remove the data on each of them yourself.
      </p>
      <form method="post" action="?handler=deleteAccount" target="htmz">
        <button
          class="danger"
          data-confirm="Delete your account and all of its data? This can't be undone. Other devices keep their copy until you remove it there."
          _click="confirm"
        >
          Delete account
        </button>
      </form>
    </section>
  `;
}

const userSettingsValidator = {
  earliestDate: maybe(createDateString("Earliest Date")),
  height: maybe(createPositiveNumber("Height")),
  goalWeight: maybe(createPositiveNumber("Goal Weight")),
  bedtime: maybe(createTimeString("Bedtime")),
};

const postHandlers: RoutePostHandler = {
  async userSettings({ data }) {
    let o = await validateObject(data, userSettingsValidator);
    let original = await db.get("user-settings");
    if (!original) {
      original = {} as UserSettings;
    }
    // Without a _rev, db.set does not mark the settings for sync.
    original._rev ??= 0;
    await db.set("user-settings", { ...original, ...o });
    return { status: 200 };
  },

  // A thrown message shows as a toast.
  async deleteAccount() {
    let status = await deleteAccount();
    if (status === 401) {
      throw "Log in again, then delete your account.";
    }
    if (status === 0) {
      throw "You appear to be offline. Connect to the internet and try again.";
    }
    if (status < 200 || status >= 300) {
      throw `Could not delete your account (status ${status}).`;
    }
    return {
      status: 200,
      body: html`${accountView(false)}${loginView()}`,
      message: "Your account and its data were deleted.",
    };
  },

  async clearData() {
    await db.clear();
    return { status: 200 };
  },
};

const route: RoutePage = {
  async get() {
    return layout({
      main: await render(),
      title: "User Settings",
    });
  },
  post: postHandlers,
};

export default route;
