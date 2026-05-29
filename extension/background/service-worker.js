// Centralised API + auth client — runs inside the service worker (module).
// The service worker is the single source of truth for the JWT; content
// scripts and the popup communicate with it via chrome.runtime.sendMessage.

const DEFAULT_API_URL = "https://premium-subtitles.preview.emergentagent.com";
const TOKEN_KEY = "context_token";
const USER_KEY = "context_user";
const API_KEY = "context_api_url";

async function getApiUrl() {
  const obj = await chrome.storage.local.get([API_KEY]);
  return obj[API_KEY] || DEFAULT_API_URL;
}

async function getToken() {
  const obj = await chrome.storage.local.get([TOKEN_KEY]);
  return obj[TOKEN_KEY] || null;
}

async function setSession(token, user) {
  await chrome.storage.local.set({ [TOKEN_KEY]: token, [USER_KEY]: user });
}

async function clearSession() {
  await chrome.storage.local.remove([TOKEN_KEY, USER_KEY]);
}

async function getUser() {
  const obj = await chrome.storage.local.get([USER_KEY]);
  return obj[USER_KEY] || null;
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const apiUrl = await getApiUrl();
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const t = await getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${apiUrl}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

// ===== Message router =====
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "AUTH_LOGIN": {
          const r = await request("/auth/login", {
            method: "POST",
            body: { email: msg.email, password: msg.password },
            auth: false,
          });
          await setSession(r.access_token, r.user);
          sendResponse({ ok: true, user: r.user });
          break;
        }
        case "AUTH_REGISTER": {
          const r = await request("/auth/register", {
            method: "POST",
            body: { email: msg.email, password: msg.password, name: msg.name },
            auth: false,
          });
          await setSession(r.access_token, r.user);
          sendResponse({ ok: true, user: r.user });
          break;
        }
        case "AUTH_LOGOUT": {
          await clearSession();
          sendResponse({ ok: true });
          break;
        }
        case "AUTH_STATE": {
          const token = await getToken();
          const user = await getUser();
          sendResponse({ ok: true, authenticated: !!token, user });
          break;
        }
        case "EXPLAIN": {
          const r = await request("/explain", {
            method: "POST",
            body: { word: msg.word, context: msg.context || "", language: msg.language || "it" },
          });
          // Auto-save to the shared library (same JWT, same backend as mobile/web)
          request("/library/save", {
            method: "POST",
            body: {
              word: r.word,
              definition: r.definition,
              domain: r.domain,
              what_to_say: r.what_to_say,
              language: msg.language || "it",
            },
          }).catch(() => {});
          sendResponse({ ok: true, data: r });
          break;
        }
        case "GET_USER": {
          try {
            const u = await request("/auth/me");
            await chrome.storage.local.set({ [USER_KEY]: u });
            sendResponse({ ok: true, user: u });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          break;
        }
        case "BILLING_STATUS": {
          const r = await request("/billing/status");
          sendResponse({ ok: true, data: r });
          break;
        }
        case "BILLING_CHECKOUT": {
          const r = await request("/billing/create-checkout-session", { method: "POST" });
          sendResponse({ ok: true, data: r });
          break;
        }
        case "SET_API_URL": {
          await chrome.storage.local.set({ [API_KEY]: msg.url });
          sendResponse({ ok: true });
          break;
        }
        case "GET_API_URL": {
          const u = await getApiUrl();
          sendResponse({ ok: true, url: u });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true; // keep channel open for async response
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Context extension installed");
});
