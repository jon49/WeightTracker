import { test, expect } from "./fixtures.js";
import { addDays, dateString, timeAgo, today } from "./dates.js";

test.describe("the Entry page", () => {
  test("saves each field as it changes, and marks the entry and start date for sync", async ({
    guest,
  }) => {
    let a = await guest();
    let date = dateString(addDays(today(), -3));
    await a.goto(`/web/entries/edit?date=${date}`);

    await a.saveField("input[name=weight]", "180.4");
    await a.saveField("input[name=waist]", "90");
    await a.saveField("textarea[name=comments]", "first\nsecond");

    // A form sends a textarea's line breaks as CRLF.
    expect(await a.idb(date)).toEqual({
      date,
      weight: 180.4,
      waist: 90,
      comments: "first\r\nsecond",
      _rev: 0,
    });
    expect(await a.idb("user-settings")).toMatchObject({ earliestDate: date, _rev: 0 });
    expect((await a.pending()).sort()).toEqual([date, "user-settings"].sort());
    await expect(a.page.locator("#syncCount")).toContainText("(2)");

    // Reopening the day shows what was saved.
    await a.goto(`/web/entries/edit?date=${date}`);
    await expect(a.page.locator("input[name=weight]")).toHaveValue("180.4");
    await expect(a.page.locator("textarea[name=comments]")).toHaveValue("first\nsecond");
  });

  test("moves the start date back for an earlier entry, but not for a later one", async ({
    guest,
  }) => {
    let a = await guest();
    let start = dateString(addDays(today(), -5));
    await a.seed({ "user-settings": { earliestDate: start, height: 70, _rev: 3 } });

    await a.goto(`/web/entries/edit?date=${dateString(addDays(today(), -1))}`);
    await a.saveField("input[name=weight]", "181");
    expect(await a.idb("user-settings")).toEqual({ earliestDate: start, height: 70, _rev: 3 });

    let earlier = dateString(addDays(today(), -9));
    await a.goto(`/web/entries/edit?date=${earlier}`);
    await a.saveField("input[name=weight]", "182");
    expect(await a.idb("user-settings")).toEqual({ earliestDate: earlier, height: 70, _rev: 3 });
  });

  test("records bedtime, then the hours slept on waking", async ({ guest }) => {
    let a = await guest();
    let date = dateString(today());
    await a.goto(`/web/entries/edit?date=${date}`);
    await expect(a.page.locator("#wake-up")).toHaveCount(0);

    await a.press("button:has-text('Bedtime')");
    let bedtime = a.page.locator("input[name=bedtime]");
    await expect(bedtime).toHaveValue(/^\d\d:\d\d$/);
    expect((await a.idb(date)).bedtime).toBe(await bedtime.inputValue());

    // Went to bed two hours ago.
    await a.seed({ [date]: { date, bedtime: timeAgo(120), _rev: 0 } });
    await a.goto(`/web/entries/edit?date=${date}`);
    await a.press("#wake-up");
    let slept = +(await a.page.locator("input[name=sleep]").inputValue());
    // A minute may tick over between seeding and waking.
    expect(slept).toBeGreaterThanOrEqual(1.98);
    expect(slept).toBeLessThanOrEqual(2.05);
    expect((await a.idb(date)).sleep).toBe(slept);
  });

  test("counts sleep across midnight", async ({ guest }) => {
    let a = await guest();
    let date = dateString(today());
    // Bedtime 23 hours and 50 minutes "ago" reads as 10 minutes from now:
    // waking before the clock reaches it means sleeping past midnight.
    await a.seed({ [date]: { date, bedtime: timeAgo(-10), _rev: 0 } });
    await a.goto(`/web/entries/edit?date=${date}`);
    await a.press("#wake-up");
    let slept = +(await a.page.locator("input[name=sleep]").inputValue());
    expect(slept).toBeGreaterThanOrEqual(23.8);
    expect(slept).toBeLessThan(24);
  });

  test("opens another day from the date field", async ({ guest }) => {
    let a = await guest();
    let date = dateString(addDays(today(), -20));
    await a.seed({ [date]: { date, weight: 177.7, _rev: 0 } });
    await a.goto("/web/entries/edit");

    await a.page.fill("input[name=date][type=date]", date);
    await a.page.waitForURL(new RegExp(`date=${date}`));
    await expect(a.page.locator("input[name=weight]")).toHaveValue("177.7");
  });

  test("grows the comment box to fit its text", async ({ guest }) => {
    let a = await guest();
    let date = dateString(today());
    await a.goto(`/web/entries/edit?date=${date}`);
    let comments = a.page.locator("textarea[name=comments]");
    let emptyHeight = await comments.evaluate((x) => x.clientHeight);

    await a.seed({ [date]: { date, comments: "1\n2\n3\n4\n5\n6", _rev: 0 } });
    await a.goto(`/web/entries/edit?date=${date}`);
    let { height, scrolls } = await comments.evaluate((x) => ({
      height: x.clientHeight,
      scrolls: x.scrollHeight > x.clientHeight + 1,
    }));
    expect(scrolls).toBe(false);
    expect(height).toBeGreaterThan(emptyHeight * 2);
  });
});

test.describe("the Entries page", () => {
  test("lists a year's entries, newest first, with links to other years", async ({ guest }) => {
    let a = await guest();
    let year = today().getFullYear();
    await a.seed({
      "user-settings": { earliestDate: `${year - 1}-12-31`, _rev: 0 },
      [`${year - 1}-12-31`]: { date: `${year - 1}-12-31`, weight: 190, _rev: 0 },
      [`${year}-03-04`]: { date: `${year}-03-04`, weight: 185.5, _rev: 0 },
      [`${year}-03-05`]: {
        date: `${year}-03-05`,
        weight: 185,
        bedtime: "22:30",
        sleep: 7.25,
        waist: 88,
        comments: "line one\nline two",
        _rev: 0,
      },
      [`${year}-06-07`]: { date: `${year}-06-07`, weight: 184, _rev: 0 },
    });

    await a.goto("/web/entries");
    await expect(a.page.locator("h2")).toHaveText(`Entries — ${year}`);
    let rows = a.page.locator("tbody tr");
    await expect(rows.locator("td:first-child")).toHaveText([
      `${year}-06-07`,
      `${year}-03-05`,
      `${year}-03-04`,
    ]);
    let full = rows.nth(1).locator("td");
    await expect(full.nth(1)).toHaveText("185");
    await expect(full.nth(2)).toHaveText(/^10:30\sPM$/);
    await expect(full.nth(3)).toHaveText("7.25");
    await expect(full.nth(4)).toHaveText("88");
    expect(await full.nth(5).innerHTML()).toBe("line one<br>line two<br>");

    await a.page.click(`a:has-text("${year - 1}")`);
    await a.page.waitForURL(new RegExp(`year=${year - 1}`));
    await expect(a.page.locator("h2")).toHaveText(`Entries — ${year - 1}`);
    await expect(rows.locator("td:first-child")).toHaveText([`${year - 1}-12-31`]);

    await a.page.click(`a:has-text("${year - 1}-12-31")`);
    await a.page.waitForURL(/\/web\/entries\/edit\?date=/);
    await expect(a.page.locator("input[name=weight]")).toHaveValue("190");
  });
});
