import { test, expect, type User } from "./fixtures.js";
import { dateString, today } from "./dates.js";

const colorScheme = (user: User) =>
  user.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

test.describe("User Settings", () => {
  test("saves each setting as it changes, and marks them for sync", async ({ guest }) => {
    let a = await guest();
    await a.goto("/web/user-settings/edit");

    await a.saveField("input[name=height]", "70");
    await a.saveField("input[name=goalWeight]", "170.5");
    await a.saveField("input[name=bedtime]", "22:15");

    expect(await a.idb("user-settings")).toMatchObject({
      height: 70,
      goalWeight: 170.5,
      bedtime: "22:15",
      _rev: 0,
    });
    expect(await a.pending()).toEqual(["user-settings"]);

    await a.goto("/web/user-settings/edit");
    await expect(a.page.locator("input[name=height]")).toHaveValue("70");
    await expect(a.page.locator("input[name=goalWeight]")).toHaveValue("170.5");
    await expect(a.page.locator("input[name=bedtime]")).toHaveValue("22:15");
  });

  test("clears all the data on this device", async ({ guest }) => {
    let a = await guest();
    let date = dateString(today());
    await a.seed({
      [date]: { date, weight: 180, _rev: 0 },
      "user-settings": { earliestDate: date, height: 70, _rev: 0 },
    });
    await a.goto("/web/user-settings/edit");

    await a.press("button:has-text('Clear All Data')");

    expect(await a.entryKeys()).toEqual([]);
    expect(await a.idb("user-settings")).toBeUndefined();
  });
});

test.describe("the theme", () => {
  test("follows the system's until toggled, then stays as toggled", async ({ guest }) => {
    let a = await guest();
    await a.goto("/web/entries/edit");
    // "light dark": the page follows the system, which is light here.
    expect(await colorScheme(a)).toBe("light dark");
    await expect(a.page.locator("#theme button")).toHaveText("🌒");
    expect(await a.idb("settings")).toBeUndefined();

    // The first press switches to the other scheme.
    await a.press("#theme button");
    expect((await a.idb("settings")).theme).toBe("dark");
    expect(await colorScheme(a)).toBe("dark");

    await a.goto("/web/charts");
    expect(await colorScheme(a)).toBe("dark");

    await a.press("#theme button");
    expect((await a.idb("settings")).theme).toBe("light");
    expect(await colorScheme(a)).toBe("light");
  });

  test("offers light first when the system's is dark", async ({ guest }) => {
    let a = await guest();
    await a.page.emulateMedia({ colorScheme: "dark" });
    await a.goto("/web/entries/edit");
    expect(await colorScheme(a)).toBe("light dark");
    await expect(a.page.locator("#theme button")).toHaveText("🌞");

    await a.press("#theme button");
    expect((await a.idb("settings")).theme).toBe("light");
    expect(await colorScheme(a)).toBe("light");
  });
});

test.describe("syncing", () => {
  test("the sync button uploads this device's entries, and another device gets them", async ({
    newUser,
    device,
  }) => {
    let a = await newUser("a");
    let date = dateString(today());
    await a.goto(`/web/entries/edit?date=${date}`);
    await a.saveField("input[name=weight]", "180.4");
    await expect(a.page.locator("#syncCount")).toContainText("(2)");

    let synced = a.page.waitForResponse((x) => x.url().includes("/web/api/sync?handler=force"));
    await a.page.click("#syncCount");
    expect(await (await synced).text()).toContain("Synced!");
    await expect.poll(() => a.pending()).toEqual([]);
    await a.goto("/web/entries/edit");
    await expect(a.page.locator("#syncCount")).not.toContainText("(");

    let a2 = await device(a.email);
    expect(await a2.sync()).toMatchObject({ status: 200, messages: ["Synced!"] });
    expect(await a2.idb(date)).toMatchObject({ date, weight: 180.4 });
    expect(await a2.idb("user-settings")).toMatchObject({ earliestDate: date });
    await a2.goto("/web/entries");
    await expect(a2.page.locator("tbody tr td").nth(1)).toHaveText("180.4");
  });

  test("merges user settings changed on two devices, keeping both changes", async ({
    newUser,
    device,
  }) => {
    let a = await newUser("a");
    let a2 = await device(a.email);
    await a2.sync();

    await a.goto("/web/user-settings/edit");
    await a.saveField("input[name=height]", "70");
    await a.sync();

    // The other device hasn't seen the height yet, and sets the goal.
    await a2.goto("/web/user-settings/edit");
    await a2.saveField("input[name=goalWeight]", "170");
    await a2.sync();
    expect(await a2.idb("user-settings")).toMatchObject({ height: 70, goalWeight: 170 });
    expect(await a2.pending()).toEqual([]);

    await a.sync();
    expect(await a.idb("user-settings")).toMatchObject({ height: 70, goalWeight: 170 });
  });
});

test.describe("the login page", () => {
  test("shows the server's message as text", async ({ page }) => {
    await page.route("**/api/auth/v1/login", (x) =>
      x.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: "<b>Wrong</b> password" }),
      }),
    );
    await page.goto("/login/");
    await page.fill("#email", "someone@example.com");
    await page.fill("#password", "not it");
    await page.click("button[type=submit]");
    await expect(page.locator("main .message")).toHaveText("<b>Wrong</b> password");
    await expect(page.locator("main .message b")).toHaveCount(0);
  });
});
