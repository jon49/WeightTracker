(() => {
  const doc = document;

  // idb-keyval-compatible store: same dbName/storeName so the service worker
  // can read tokens written here.
  function idbSet(key, value) {
    return new Promise((resolve, reject) => {
      let req = indexedDB.open("keyval-store", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("keyval");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        let db = req.result;
        let tx = db.transaction("keyval", "readwrite");
        tx.objectStore("keyval").put(value, key);
        tx.oncomplete = () => (db.close(), resolve());
        tx.onerror = tx.onabort = () => reject(tx.error);
      };
    });
  }

  async function saveTokens({ auth_token, refresh_token, csrf_token }) {
    await Promise.all([
      auth_token != null && idbSet("auth_token", auth_token),
      refresh_token != null && idbSet("refresh_token", refresh_token),
      csrf_token != null && idbSet("csrf_token", csrf_token),
      idbSet("loggedIn", true),
    ].filter(Boolean));
  }

  function formToJson(form) {
    let obj = {};
    new FormData(form).forEach((v, k) => (obj[k] = v));
    return obj;
  }

  doc.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const action = form.action;
    const payload = formToJson(form);

    let response;
    try {
      response = await fetch(action, {
        method: form.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      writeMessage("Network error. Please try again.");
      return;
    }

    let data;
    if (response.headers.get("content-type")?.includes("application/json")) {
      try { data = await response.json(); } catch {}
    }

    if (!response.ok) {
      writeMessage(data?.message || data?.error || `Error: ${response.status}`);
      return;
    }

    if (action.includes("/api/auth/v1/login")) {
      if (data?.auth_token) await saveTokens(data);
      location.href = "/web/?login=success";
      return;
    }

    if (action.includes("/api/auth/v1/register")) {
      // TrailBase requires email verification before login works. Don't
      // attempt auto-login — direct the user to check their email.
      writeMessage(
        "Registration received. Check your email for a verification link, then log in.",
      );
      return;
    }

    if (action.includes("/api/auth/v1/reset_password/update")) {
      // Logging the user in after a reset requires their email; just send
      // them to /login.
      location.href = "/login";
      return;
    }

    if (action.includes("/api/auth/v1/reset_password/request")) {
      writeMessage("If that email is registered, a reset link will be sent.");
      return;
    }
  });

  function getHtml(text) {
    const template = doc.createElement("template");
    template.innerHTML = text.trim();
    return template.content;
  }

  function writeMessage(msg) {
    let message = getHtml(`<p class="message">${msg}</p>`);
    doc.querySelector("main").prepend(message);
  }
})();
