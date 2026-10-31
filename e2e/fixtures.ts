import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { API_PORT, DEPOT } from "./env.js";

const PASSWORD = "E2eTest!12345";

export function sql(query: string): string {
  return execFileSync("sqlite3", [`${DEPOT}data/main.db`, query], { encoding: "utf8" }).trim();
}

// Signs up through the API like a user would, then marks the address
// verified (unverified users can't log in). Plain sqlite3 lacks the
// is_email() that _user's CHECK constraints call, so skip those.
async function registerVerified(email: string) {
  let res = await fetch(`http://localhost:${API_PORT}/api/auth/v1/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, password_repeat: PASSWORD }),
  });
  expect(res.ok, `register ${email}: ${res.status}`).toBe(true);
  sql(`PRAGMA ignore_check_constraints = ON;
       UPDATE _user SET email = unverified_email, unverified_email = NULL
       WHERE unverified_email = '${email}';`);
}

export interface SyncResult {
  status: number;
  messages: string[];
}

// Entry keys are dates, YYYY-MM-DD.
const isEntryKey = (key: unknown) => typeof key === "string" && /^\d{4}-\d\d-\d\d$/.test(key);

// One user on one device: a logged-in browser context of its own.
export class User {
  constructor(
    readonly email: string,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  static async create(browser: Browser, email: string) {
    let context = await browser.newContext();
    let page = await context.newPage();
    page.on("dialog", (x) => x.accept());
    return new User(email, context, page);
  }

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState("networkidle");
  }

  async login() {
    await this.page.goto("/login/");
    await this.fillLogin();
    // /web/?login=success -> /web/ -> /web/entries/edit
    await this.page.waitForURL(/\/web\/entries\/edit/);
    await this.serviceWorker();
  }

  async fillLogin() {
    await this.page.fill("#email", this.email);
    await this.page.fill("#password", PASSWORD);
    await this.page.click("button[type=submit]");
  }

  // The first visit installs the service worker; until it controls the page,
  // /web/ requests don't reach the app.
  async serviceWorker() {
    await expect
      .poll(
        async () => {
          try {
            let ok = await this.page.evaluate(() => !!navigator.serviceWorker?.controller);
            if (!ok) await this.page.reload();
            return ok;
          } catch {
            // The page navigated mid-check (e.g. a client-side redirect).
            return false;
          }
        },
        { timeout: 20_000 },
      )
      .toBe(true);
  }

  async logout() {
    await this.page.goto("/login/?logout");
    // Clears the tokens, then /web/?loggedOut=true -> /web/ -> /web/entries/edit.
    await this.page.waitForURL(/\/web\/entries\/edit/);
    await this.page.waitForLoadState("networkidle");
    expect(await this.idb("auth_token")).toBeFalsy();
  }

  // Saves today's weight from the Entry page.
  async addEntry(weight: string) {
    await this.goto("/web/entries/edit");
    let saved = this.page.waitForResponse(
      (x) => x.request().method() === "POST" && x.url().includes("/web/entries/edit"),
    );
    await this.page.fill("input[name=weight]", weight);
    await this.page.press("input[name=weight]", "Tab");
    expect((await saved).ok()).toBe(true);
    expect(await this.entryKeys()).toHaveLength(1);
  }

  // Deletes the account from User Settings (the confirm is accepted);
  // returns the toasts the app showed.
  async deleteAccount(): Promise<string[]> {
    await this.goto("/web/user-settings/edit");
    let done = this.page.waitForResponse((x) => x.url().includes("handler=deleteAccount"));
    await this.page.click("#account button:has-text('Delete account')");
    let doc = await (await done).text();
    await this.page.waitForLoadState("networkidle");
    return Array.from(doc.matchAll(/<p class=message>([^<]*)<\/p>/g), (x) => x[1]);
  }

  async sync(): Promise<SyncResult> {
    return this.page.evaluate(async () => {
      let res = await fetch("/web/api/sync?handler=force", {
        method: "POST",
        headers: { "HF-Request": "true" },
      });
      let doc = new DOMParser().parseFromString(await res.text(), "text/html");
      let messages = Array.from(
        doc.querySelectorAll("#toasts .message"),
        (x) => x.textContent ?? "",
      );
      return { status: res.status, messages };
    });
  }

  /*** IndexedDB (the app's local data) ***/

  async idb<T = any>(key: unknown): Promise<T | undefined> {
    return this.page.evaluate(
      (key) =>
        new Promise<any>((resolve, reject) => {
          let open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            let req = open.result
              .transaction("keyval")
              .objectStore("keyval")
              .get(key as IDBValidKey);
            req.onsuccess = () => resolve(req.result instanceof Set ? [...req.result] : req.result);
            req.onerror = () => reject(req.error);
          };
        }),
      key,
    );
  }

  async idbKeys(): Promise<unknown[]> {
    return this.page.evaluate(
      () =>
        new Promise<unknown[]>((resolve) => {
          let open = indexedDB.open("keyval-store");
          open.onsuccess = () => {
            let req = open.result.transaction("keyval").objectStore("keyval").getAllKeys();
            req.onsuccess = () => resolve(req.result);
          };
        }),
    );
  }

  async entryKeys(): Promise<unknown[]> {
    return (await this.idbKeys()).filter(isEntryKey);
  }
}

interface Fixtures {
  // Creates a new verified user. Call `device()` again with the same email for
  // a second device of the same user.
  newUser: (name: string) => Promise<User>;
  device: (email: string) => Promise<User>;
}

export const test = base.extend<Fixtures>({
  device: async ({ browser }, use) => {
    let users: User[] = [];
    await use(async (email) => {
      let user = await User.create(browser, email);
      users.push(user);
      await user.login();
      return user;
    });
    await Promise.all(users.map((x) => x.context.close()));
  },

  newUser: async ({ device }, use) => {
    await use(async (name) => {
      let email = `${name}-${randomUUID().slice(0, 8)}@example.com`;
      await registerVerified(email);
      return device(email);
    });
  },
});

export { expect };
