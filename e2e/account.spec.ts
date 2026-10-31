import { test, expect, sql } from "./fixtures.js";

const userId = (email: string) => sql(`SELECT hex(id) FROM _user WHERE email = '${email}'`);
const count = (query: string) => +sql(`SELECT COUNT(*) FROM ${query}`);

test.describe("deleting your account", () => {
  test("removes the account and its data, on the server and on this device", async ({
    newUser,
  }) => {
    let a = await newUser("a");
    await a.addEntry("180.4");
    await a.sync();
    let id = userId(a.email);
    expect(count(`user_data WHERE hex(user) = '${id}'`)).toBeGreaterThan(0);

    expect(await a.deleteAccount()).toEqual(["Your account and its data were deleted."]);

    expect(count(`_user WHERE hex(id) = '${id}'`)).toBe(0);
    expect(count(`user_data WHERE hex(user) = '${id}'`)).toBe(0);
    await expect(a.page.locator("#auth-link")).toHaveText("Login");
    await expect(a.page.locator("#account")).toBeEmpty();
    expect(await a.idb("auth_token")).toBeFalsy();
    expect(await a.idb("refresh_token")).toBeFalsy();
    expect(await a.entryKeys()).toEqual([]);
    expect(await a.idb("user-settings")).toBeUndefined();

    // The account is gone, so its password no longer logs in.
    await a.page.goto("/login/");
    await a.fillLogin();
    await expect(a.page.locator("main .message")).toBeVisible();
    expect(a.page.url()).toContain("/login");
  });

  test("keeps the theme this device was set to", async ({ newUser }) => {
    let a = await newUser("a");
    await a.goto("/web/user-settings/edit");
    await a.page.evaluate(() =>
      fetch("/web/api/settings?handler=theme", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "theme=dark",
      }),
    );
    await a.deleteAccount();
    expect(await a.idb("settings")).toMatchObject({ theme: "dark" });
  });

  test("logs the user's other devices out on their next sync, keeping their copy", async ({
    newUser,
    device,
  }) => {
    let a = await newUser("a");
    await a.addEntry("180.4");
    await a.sync();
    let a2 = await device(a.email);
    await a2.sync();
    expect(await a2.entryKeys()).toHaveLength(1);

    await a.deleteAccount();

    await a2.sync();
    expect(await a2.idb("auth_token")).toBeFalsy();
    expect(await a2.entryKeys()).toHaveLength(1);
    await a2.goto("/web/entries/edit");
    await expect(a2.page.locator("#auth-link")).toHaveText("Login");
  });

  test("when the server can't be reached, keeps the account and this device's data", async ({
    newUser,
  }) => {
    let a = await newUser("a");
    await a.addEntry("180.4");
    // setOffline() doesn't reach the service worker's requests; routing does.
    await a.context.route("**/api/auth/v1/delete", (x) => x.abort("internetdisconnected"));

    expect(await a.deleteAccount()).toEqual([
      "You appear to be offline. Connect to the internet and try again.",
    ]);

    expect(count(`_user WHERE email = '${a.email}'`)).toBe(1);
    expect(await a.idb("auth_token")).toBeTruthy();
    expect(await a.entryKeys()).toHaveLength(1);
    await expect(a.page.locator("#account button")).toHaveText("Delete account");
  });

  test("refreshes a stale login token first", async ({ newUser }) => {
    let a = await newUser("a");
    await a.addEntry("180.4");
    await a.sync();
    // An auth token the server no longer accepts; the refresh token still works.
    await a.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            let tx = open.result.transaction("keyval", "readwrite");
            tx.objectStore("keyval").put("stale", "auth_token");
            tx.oncomplete = () => resolve();
          };
        }),
    );

    expect(await a.deleteAccount()).toEqual(["Your account and its data were deleted."]);
    expect(count(`_user WHERE email = '${a.email}'`)).toBe(0);
  });

  test("waits for a sync in flight, even one started from another page", async ({ newUser }) => {
    let a = await newUser("a");
    await a.addEntry("180.4");
    // Hold the sync at the server for a while, and note when it goes through
    // and when the delete is sent.
    let syncHeld = false;
    let syncReleased = 0;
    let deleteSent = 0;
    await a.context.route("**/api/data/weight", async (route) => {
      syncHeld = true;
      await new Promise((x) => setTimeout(x, 2000));
      syncReleased = Date.now();
      await route.continue();
    });
    await a.context.route("**/api/auth/v1/delete", async (route) => {
      deleteSent = Date.now();
      await route.continue();
    });

    // The sync runs in the sync page's code, the delete in User Settings'.
    a.sync().catch(() => {}); // the page navigates away before it answers
    await expect.poll(() => syncHeld).toBe(true);
    expect(await a.deleteAccount()).toEqual(["Your account and its data were deleted."]);

    expect(syncReleased).toBeGreaterThan(0);
    expect(deleteSent).toBeGreaterThanOrEqual(syncReleased);
    expect(await a.entryKeys()).toEqual([]);
  });

  test("is offered only while logged in", async ({ newUser }) => {
    let a = await newUser("a");
    await a.goto("/web/user-settings/edit");
    await expect(a.page.locator("#account button")).toHaveText("Delete account");
    await a.logout();
    await a.goto("/web/user-settings/edit");
    await expect(a.page.locator("#account button")).toHaveCount(0);
  });
});
