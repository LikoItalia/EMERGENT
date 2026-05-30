// Context extension — service worker.
// Proxies all API calls to the project backend (same as the mobile and web apps).
// The JWT is the single source of truth: it is fetched from chrome.storage.local
// and attached as Bearer to every authenticated request.

const DEFAULT_API_URL = 'https://premium-subtitles.preview.emergentagent.com';
const API_URL_KEY = 'ctx_api_url';
const TOKEN_KEY = 'ctx_jwt';
const USER_KEY = 'ctx_user';

async function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
async function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}
async function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

async function apiBase() {
  const res = await storageGet([API_URL_KEY]);
  return res[API_URL_KEY] || DEFAULT_API_URL;
}
async function getToken() {
  const res = await storageGet([TOKEN_KEY]);
  return res[TOKEN_KEY] || null;
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const base = await apiBase();
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = await getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    throw err;
  }
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'AUTH_STATE': {
          const token = await getToken();
          const { [USER_KEY]: user } = await storageGet([USER_KEY]);
          sendResponse({ ok: true, authenticated: !!token, user: user || null });
          break;
        }

        case 'AUTH_LOGIN': {
          const r = await request('/auth/login', {
            method: 'POST',
            body: { email: message.email, password: message.password },
            auth: false,
          });
          await storageSet({ [TOKEN_KEY]: r.access_token, [USER_KEY]: r.user });
          sendResponse({ ok: true, user: r.user });
          break;
        }

        case 'AUTH_REGISTER': {
          const r = await request('/auth/register', {
            method: 'POST',
            body: { email: message.email, password: message.password, name: message.name },
            auth: false,
          });
          await storageSet({ [TOKEN_KEY]: r.access_token, [USER_KEY]: r.user });
          sendResponse({ ok: true, user: r.user });
          break;
        }

        case 'AUTH_LOGOUT': {
          await storageRemove([TOKEN_KEY, USER_KEY]);
          sendResponse({ ok: true });
          break;
        }

        case 'FETCH_DEFINITION': {
          // Calls /api/explain on the project backend (Claude Haiku via emergentintegrations).
          // Auto-saves the result to /api/library/save with the same JWT — sharing the library
          // with the mobile app and the web app at row level.
          const lang = message.lang || 'it';
          try {
            const r = await request('/explain', {
              method: 'POST',
              body: { word: message.word, context: message.context || '', language: lang },
            });

            // Map backend keys (what_to_say) to extension keys (phrase) without
            // changing the existing content.js render code.
            const result = {
              definition: r.definition || '',
              domain: r.domain || 'Generale',
              phrase: r.what_to_say || '',
              detail: r.detail || '',
            };

            // Fire-and-forget auto-save. Failures here don't block the UI.
            request('/library/save', {
              method: 'POST',
              body: {
                word: r.word || message.word,
                definition: r.definition || '',
                domain: r.domain || 'Generale',
                what_to_say: r.what_to_say || '',
                language: lang,
              },
            }).catch((e) => console.warn('[Context] library save failed:', e?.message));

            sendResponse({ success: true, result });
          } catch (e) {
            if (e.status === 401) {
              await storageRemove([TOKEN_KEY, USER_KEY]);
              sendResponse({ success: false, error: 'Sessione scaduta. Accedi di nuovo.', authExpired: true });
            } else {
              sendResponse({ success: false, error: e.message || 'Errore sconosciuto' });
            }
          }
          break;
        }

        case 'BILLING_STATUS': {
          try {
            const r = await request('/billing/status');
            sendResponse({ ok: true, data: r });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          break;
        }

        case 'BILLING_CHECKOUT': {
          try {
            const r = await request('/billing/create-checkout-session', { method: 'POST' });
            sendResponse({ ok: true, data: r });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
          break;
        }

        case 'SET_API_URL': {
          await storageSet({ [API_URL_KEY]: message.url });
          sendResponse({ ok: true });
          break;
        }

        case 'GET_API_URL': {
          const url = await apiBase();
          sendResponse({ ok: true, url });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, success: false, error: e.message || String(e) });
    }
  })();
  return true; // keep the message channel open for async response
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Context] extension installed — backend:', DEFAULT_API_URL);
});
