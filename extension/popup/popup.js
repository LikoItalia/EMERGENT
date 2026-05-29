// Popup UI — talks to the service worker over chrome.runtime.sendMessage.

function svgLogo() {
  return `
    <svg width="22" height="22" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9d75ff"/>
          <stop offset="1" stop-color="#7c50ff"/>
        </linearGradient>
      </defs>
      <path d="M44 16 a18 18 0 1 0 0 32" stroke="url(#g)" stroke-width="7" stroke-linecap="round" fill="none"/>
    </svg>`;
}

const iconMail = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
const iconLock = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const iconUser = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const $ = (q, r = document) => r.querySelector(q);

function send(type, payload = {}) {
  return new Promise((res) => chrome.runtime.sendMessage({ type, ...payload }, res));
}

function brandHeader() {
  return `
    <div class="brand-row">
      <div class="logo">${svgLogo()}</div>
      <span class="brand">Context</span>
    </div>
    <p class="tag">Sottotitoli decodificati su Google Meet.</p>
  `;
}

function renderAuth(mode = "login") {
  document.getElementById("root").innerHTML = `
    ${brandHeader()}
    <div class="tabs">
      <button id="tab-login" class="${mode === "login" ? "active" : ""}">Accedi</button>
      <button id="tab-register" class="${mode === "register" ? "active" : ""}">Registrati</button>
    </div>
    <form id="auth-form">
      ${mode === "register" ? `
        <div class="field">${iconUser}<input id="i-name" type="text" placeholder="Nome" autocomplete="name"></div>
      ` : ""}
      <div class="field">${iconMail}<input id="i-email" type="email" placeholder="Email" autocomplete="email"></div>
      <div class="field">${iconLock}<input id="i-password" type="password" placeholder="Password" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></div>
      <p id="err" class="err" style="display:none"></p>
      <button id="submit" type="submit" class="cta">
        ${mode === "login" ? "Accedi" : "Inizia prova 7 giorni"}
      </button>
    </form>
    <p class="note">
      ${mode === "register" ? "Dopo 7 giorni, Pro €9/mese. Annulli quando vuoi." : "Stesso account dell'app mobile e web."}
    </p>
  `;

  $("#tab-login").onclick = () => renderAuth("login");
  $("#tab-register").onclick = () => renderAuth("register");

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#i-email").value.trim();
    const password = $("#i-password").value;
    const name = mode === "register" ? $("#i-name").value.trim() : "";
    if (!email || !password || (mode === "register" && !name)) {
      showError("Compila tutti i campi");
      return;
    }
    const btn = $("#submit");
    btn.disabled = true; btn.textContent = "Attendi…";
    const r = await send(mode === "login" ? "AUTH_LOGIN" : "AUTH_REGISTER", { email, password, name });
    if (!r?.ok) {
      btn.disabled = false;
      btn.textContent = mode === "login" ? "Accedi" : "Inizia prova 7 giorni";
      showError(r?.error || "Errore");
      return;
    }
    renderSignedIn();
  });
}

function showError(msg) {
  const e = $("#err");
  if (!e) return;
  e.textContent = msg;
  e.style.display = "block";
}

async function renderSignedIn() {
  const root = $("#root");
  root.innerHTML = `
    ${brandHeader()}
    <div id="profile-slot"></div>
    <div class="tip">
      <div class="tip-title">Come usarla su Meet</div>
      <div class="tip-body">
        1. Apri <b>meet.google.com</b><br>
        2. Attiva i <b>sottotitoli</b> di Meet (icona CC in basso)<br>
        3. L'overlay viola apparirà in basso — tocca una parola per scoprirla.
      </div>
    </div>
    <div id="billing-slot"></div>
    <div class="links">
      <a href="https://meet.google.com/" target="_blank" rel="noopener">Apri Meet</a>
      <a id="library-link" href="#" target="_blank" rel="noopener">Libreria</a>
    </div>
    <button id="logout" class="cta danger" style="margin-top:12px;">Esci</button>
    <p class="foot">v1.0 · Stesso account di mobile + web</p>
  `;

  // Fetch user + billing in parallel.
  const [authState, billing, apiUrlResp] = await Promise.all([
    send("AUTH_STATE"),
    send("BILLING_STATUS").catch(() => ({ ok: false })),
    send("GET_API_URL"),
  ]);

  const user = authState?.user || {};
  const initial = (user.name?.[0] || user.email?.[0] || "?").toUpperCase();
  $("#profile-slot").innerHTML = `
    <div class="profile">
      <div class="avatar">${initial}</div>
      <div style="flex:1; min-width:0;">
        <div class="name">${escapeHtml(user.name || "Utente")}</div>
        <div class="email" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(user.email || "")}</div>
      </div>
    </div>
  `;

  if (billing?.ok) {
    const b = billing.data;
    const chipClass = b.status === "active" ? "chip active" : b.status === "expired" ? "chip expired" : "chip";
    const chipLabel = b.status === "active" ? "Pro attivo"
      : b.status === "expired" ? "Prova scaduta"
      : `Pro Trial · ${b.days_left}g`;
    $("#billing-slot").innerHTML = `
      <div class="row" style="margin-bottom:10px;">
        <span class="${chipClass}">${chipLabel}</span>
        ${b.status !== "active" ? `<button id="upgrade" class="cta" style="width:auto; padding:8px 14px; font-size:12px;">Passa a Pro</button>` : ""}
      </div>
    `;
    const u = $("#upgrade");
    if (u) u.addEventListener("click", async () => {
      const r = await send("BILLING_CHECKOUT");
      if (r?.ok) chrome.tabs.create({ url: r.data.checkout_url });
    });
  }

  // Library link points back to the web app
  $("#library-link").href = `${apiUrlResp?.url || "https://premium-subtitles.preview.emergentagent.com"}`;

  $("#logout").addEventListener("click", async () => {
    await send("AUTH_LOGOUT");
    renderAuth("login");
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

(async function bootstrap() {
  const state = await send("AUTH_STATE");
  if (state?.authenticated) {
    renderSignedIn();
    // Best-effort refresh
    send("GET_USER").then((r) => {
      if (r?.ok) renderSignedIn();
    });
  } else {
    renderAuth("login");
  }
})();
