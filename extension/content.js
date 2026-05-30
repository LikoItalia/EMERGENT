// Context content script — runs on Google Meet + Microsoft Teams.
// Reads the platform's native captions (no audio capture), wraps each word
// into a clickable span, and on click shows a panel with the AI definition.
// Authentication uses the same JWT as the project's mobile and web apps.

// ── Platform detection ────────────────────────────────────────────────────────

const PLATFORM = (() => {
  const h = location.hostname;
  if (h === 'meet.google.com') return 'meet';
  if (h === 'teams.microsoft.com' || h === 'teams.live.com') return 'teams';
  return 'unknown';
})();

console.log('[Context] piattaforma rilevata:', PLATFORM);

const SELECTORS_BY_PLATFORM = {
  meet: [
    '[jsname="tgaKEf"]',
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[data-message-text]',
    'div[class*="CNusmb"]',
    '[jsname="YSxPC"]',
    '.a4cQT',
    '.iOzk7',
    '.bj3YUb'
  ],
  teams: [
    '[data-tid="closed-caption-text"]',
    '.ts-captions-container span',
    '[class*="captionText"]',
    '[class*="caption-text"]'
  ]
};

const SUBTITLE_SELECTORS = SELECTORS_BY_PLATFORM[PLATFORM] ?? [
  ...SELECTORS_BY_PLATFORM.meet,
  ...SELECTORS_BY_PLATFORM.teams
];

const LANGUAGES = [
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
];

let currentLang = 'it';
let panel = null;
let activeSpan = null;
const pendingContainers = new Map();
const knownContainers = new WeakSet();
let statusBadge = null;
let wordCount = 0;

// ── Auth state ────────────────────────────────────────────────────────────────
// Stored as { authenticated: boolean, user: { email, name, ... } | null }
let authState = { authenticated: false, user: null };

function sendBgMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(response);
    });
  });
}

async function refreshAuthState() {
  const r = await sendBgMessage({ type: 'AUTH_STATE' });
  authState = { authenticated: !!r?.authenticated, user: r?.user || null };
  return authState;
}

async function initAuth() {
  await refreshAuthState();
  if (!authState.authenticated) {
    setTimeout(showLoginPopup, 1000);
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function buildStatusBadge() {
  const badge = document.createElement('div');
  badge.id = 'ctx-status';
  badge.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px',
    'z-index:2147483646', 'background:#111214', 'color:#9aa0a6',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'font-size:11px', 'font-weight:600', 'letter-spacing:0.4px',
    'padding:6px 10px', 'border-radius:20px',
    'border:1px solid #2c2f35', 'display:flex', 'align-items:center',
    'gap:6px', 'cursor:default', 'user-select:none',
    'box-shadow:0 2px 12px rgba(0,0,0,0.4)'
  ].join('!important;') + '!important';

  const dot = document.createElement('div');
  dot.id = 'ctx-status-dot';
  dot.style.cssText = [
    'width:6px', 'height:6px', 'border-radius:50%', 'background:#ef4444',
    'flex-shrink:0', 'transition:background 0.3s'
  ].join('!important;') + '!important';

  const label = document.createElement('span');
  label.id = 'ctx-status-label';
  label.textContent = 'Context — in attesa';

  badge.appendChild(dot);
  badge.appendChild(label);
  document.body.appendChild(badge);
  return badge;
}

function updateStatus(found, count) {
  if (!statusBadge) return;
  const dot = document.getElementById('ctx-status-dot');
  const label = document.getElementById('ctx-status-label');
  if (found) {
    dot.style.setProperty('background', '#10b981', 'important');
    label.textContent = `Context — ${count} parole`;
  } else {
    dot.style.setProperty('background', '#f59e0b', 'important');
    label.textContent = 'Context — no sottotitoli';
  }
}

// ── Language selector ─────────────────────────────────────────────────────────

function updateLangUI() {
  LANGUAGES.forEach(({ code }) => {
    const btn = document.getElementById('ctx-lang-' + code);
    if (btn) btn.classList.toggle('active', code === currentLang);
  });
}

function setLang(code) {
  currentLang = code;
  chrome.storage.local.set({ ctx_lang: code });
  updateLangUI();
}

function buildLangBar() {
  const bar = document.createElement('div');
  bar.id = 'ctx-lang-bar';
  LANGUAGES.forEach(({ code, flag, label }) => {
    const btn = document.createElement('button');
    btn.id = 'ctx-lang-' + code;
    btn.className = 'ctx-lang-btn';
    btn.title = label;
    const flagSpan = document.createElement('span');
    flagSpan.className = 'ctx-lang-flag';
    flagSpan.textContent = flag;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'ctx-lang-label';
    labelSpan.textContent = label;
    btn.appendChild(flagSpan);
    btn.appendChild(labelSpan);
    btn.addEventListener('click', () => setLang(code));
    bar.appendChild(btn);
  });
  return bar;
}

// ── Panel creation ────────────────────────────────────────────────────────────

function buildPanel() {
  const el = document.createElement('div');
  el.id = 'ctx-panel';

  const header = document.createElement('div');
  header.id = 'ctx-header';

  const logo = document.createElement('div');
  logo.className = 'ctx-logo';
  const dot = document.createElement('div');
  dot.className = 'ctx-logo-dot';
  logo.appendChild(dot);
  logo.appendChild(document.createTextNode('Context'));

  const closeBtn = document.createElement('button');
  closeBtn.id = 'ctx-close';
  closeBtn.className = 'ctx-close-btn';
  closeBtn.setAttribute('aria-label', 'Chiudi');
  closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';

  header.appendChild(logo);
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.id = 'ctx-content';

  const loading = document.createElement('div');
  loading.id = 'ctx-loading';
  const spinner = document.createElement('div');
  spinner.className = 'ctx-spinner';
  const loadingText = document.createElement('div');
  loadingText.className = 'ctx-loading-text';
  loadingText.textContent = 'Analisi in corso...';
  loading.appendChild(spinner);
  loading.appendChild(loadingText);

  const error = document.createElement('div');
  error.id = 'ctx-error';
  const errorIcon = document.createElement('div');
  errorIcon.className = 'ctx-error-icon';
  errorIcon.textContent = '⚠️';
  const errorTitle = document.createElement('div');
  errorTitle.className = 'ctx-error-title';
  errorTitle.textContent = 'Qualcosa è andato storto';
  const errorMsg = document.createElement('div');
  errorMsg.id = 'ctx-error-msg';
  errorMsg.className = 'ctx-error-msg';
  error.appendChild(errorIcon);
  error.appendChild(errorTitle);
  error.appendChild(errorMsg);

  const result = document.createElement('div');
  result.id = 'ctx-result';

  const wordTitle = document.createElement('div');
  wordTitle.id = 'ctx-word-title';

  const domainBadge = document.createElement('div');
  domainBadge.id = 'ctx-domain-badge';
  domainBadge.className = 'ctx-domain-badge';

  const definition = document.createElement('div');
  definition.id = 'ctx-definition';
  definition.className = 'ctx-definition';

  const savedHint = document.createElement('div');
  savedHint.id = 'ctx-saved-hint';
  savedHint.className = 'ctx-saved-hint';
  savedHint.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Salvata nella libreria · sincronizzata con mobile e web</span>';

  const divider = document.createElement('div');
  divider.className = 'ctx-divider';

  const phraseSection = document.createElement('div');
  phraseSection.className = 'ctx-phrase-section';
  const shieldIcon = document.createElement('div');
  shieldIcon.className = 'ctx-shield-icon';
  shieldIcon.textContent = '🛡️';
  const phraseContent = document.createElement('div');
  const phraseLabel = document.createElement('div');
  phraseLabel.className = 'ctx-phrase-label';
  phraseLabel.textContent = 'Cosa dire:';
  const phraseText = document.createElement('div');
  phraseText.id = 'ctx-phrase';
  phraseText.className = 'ctx-phrase-text';
  phraseContent.appendChild(phraseLabel);
  phraseContent.appendChild(phraseText);
  phraseSection.appendChild(shieldIcon);
  phraseSection.appendChild(phraseContent);

  const detailSection = document.createElement('div');
  detailSection.className = 'ctx-detail-section';
  const detailToggle = document.createElement('button');
  detailToggle.id = 'ctx-detail-toggle';
  detailToggle.className = 'ctx-detail-toggle';
  const detailArrow = document.createElement('span');
  detailArrow.id = 'ctx-detail-arrow';
  detailArrow.className = 'ctx-detail-arrow';
  detailArrow.textContent = '▶';
  detailToggle.appendChild(detailArrow);
  detailToggle.appendChild(document.createTextNode('Scopri di più'));
  const detailBody = document.createElement('div');
  detailBody.id = 'ctx-detail-body';
  detailBody.className = 'ctx-detail-body';
  detailSection.appendChild(detailToggle);
  detailSection.appendChild(detailBody);

  result.appendChild(wordTitle);
  result.appendChild(domainBadge);
  result.appendChild(definition);
  result.appendChild(savedHint);
  result.appendChild(divider);
  result.appendChild(phraseSection);
  result.appendChild(detailSection);

  // Logged-out state (replaces the old "expired" state)
  const loggedOut = document.createElement('div');
  loggedOut.id = 'ctx-expired';
  const lockIcon = document.createElement('div');
  lockIcon.className = 'ctx-expired-icon';
  lockIcon.textContent = '🔒';
  const loTitle = document.createElement('div');
  loTitle.className = 'ctx-expired-title';
  loTitle.textContent = 'Accedi per continuare';
  const loMsg = document.createElement('div');
  loMsg.className = 'ctx-expired-msg';
  loMsg.textContent = 'Usa lo stesso account dell\'app mobile e web per salvare le parole.';
  const loBtn = document.createElement('button');
  loBtn.className = 'ctx-expired-btn';
  loBtn.textContent = 'Accedi a Context';
  loBtn.addEventListener('click', () => { hidePanel(); showLoginPopup(); });
  loggedOut.appendChild(lockIcon);
  loggedOut.appendChild(loTitle);
  loggedOut.appendChild(loMsg);
  loggedOut.appendChild(loBtn);

  // Search bar
  const searchSection = document.createElement('div');
  searchSection.id = 'ctx-search-section';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'ctx-search-input';
  searchInput.placeholder = 'Parola o frase...';
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('spellcheck', 'false');
  const searchBtn = document.createElement('button');
  searchBtn.id = 'ctx-search-btn';
  searchBtn.textContent = 'Cerca';
  searchSection.appendChild(searchInput);
  searchSection.appendChild(searchBtn);

  // Footer with account info + library link + logout
  const footer = document.createElement('div');
  footer.id = 'ctx-footer';
  const accountLine = document.createElement('div');
  accountLine.id = 'ctx-account-line';
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'ctx-logout-btn';
  logoutBtn.textContent = 'Esci';
  logoutBtn.addEventListener('click', async () => {
    await sendBgMessage({ type: 'AUTH_LOGOUT' });
    await refreshAuthState();
    hidePanel();
    showLoginPopup();
  });
  footer.appendChild(accountLine);
  footer.appendChild(logoutBtn);

  content.appendChild(searchSection);
  content.appendChild(loading);
  content.appendChild(error);
  content.appendChild(result);
  content.appendChild(loggedOut);
  content.appendChild(footer);

  el.appendChild(header);
  el.appendChild(buildLangBar());
  el.appendChild(content);
  document.body.appendChild(el);

  updateLangUI();
  closeBtn.addEventListener('click', hidePanel);
  detailToggle.addEventListener('click', () => {
    const body = document.getElementById('ctx-detail-body');
    const arrow = document.getElementById('ctx-detail-arrow');
    const isOpen = body.classList.toggle('open');
    arrow.classList.toggle('open', isOpen);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); triggerSearch(); }
  });
  searchBtn.addEventListener('click', triggerSearch);

  return el;
}

function ensurePanel() {
  if (!panel) panel = buildPanel();
  updateFooter();
}

function updateFooter() {
  const line = document.getElementById('ctx-account-line');
  if (!line) return;
  if (authState.authenticated && authState.user) {
    line.textContent = authState.user.email || '';
    document.getElementById('ctx-footer').style.display = 'flex';
  } else {
    document.getElementById('ctx-footer').style.display = 'none';
  }
}

// ── Panel state ───────────────────────────────────────────────────────────────

const DOMAIN_COLORS = {
  Tech:      { bg: 'rgba(59,130,246,0.15)',  color: '#3B82F6', border: 'rgba(59,130,246,0.25)'  },
  Finance:   { bg: 'rgba(16,185,129,0.15)',  color: '#10B981', border: 'rgba(16,185,129,0.25)'  },
  Legal:     { bg: 'rgba(139,92,246,0.15)',  color: '#8B5CF6', border: 'rgba(139,92,246,0.25)'  },
  Marketing: { bg: 'rgba(245,158,11,0.15)',  color: '#F59E0B', border: 'rgba(245,158,11,0.25)'  },
  Strategy:  { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444', border: 'rgba(239,68,68,0.25)'   },
  HR:        { bg: 'rgba(236,72,153,0.15)',  color: '#EC4899', border: 'rgba(236,72,153,0.25)'  },
  Medicina:  { bg: 'rgba(244,63,94,0.15)',   color: '#FB7185', border: 'rgba(244,63,94,0.25)'   },
  Scienza:   { bg: 'rgba(168,85,247,0.15)',  color: '#A855F7', border: 'rgba(168,85,247,0.25)'  },
  Sport:     { bg: 'rgba(132,204,22,0.15)',  color: '#84CC16', border: 'rgba(132,204,22,0.25)'  },
  Arte:      { bg: 'rgba(217,70,239,0.15)',  color: '#D946EF', border: 'rgba(217,70,239,0.25)'  },
  Politica:  { bg: 'rgba(239,68,68,0.15)',   color: '#EF4444', border: 'rgba(239,68,68,0.25)'   },
  Generale:  { bg: 'rgba(161,161,170,0.15)', color: '#A1A1AA', border: 'rgba(161,161,170,0.25)' }
};

function showState(name) {
  ['loading', 'error', 'result', 'expired'].forEach(s => {
    document.getElementById('ctx-' + s)?.classList.toggle('active', s === name);
  });
}

function showError(msg) {
  document.getElementById('ctx-error-msg').textContent = msg;
  showState('error');
}

function renderResult(word, res) {
  document.getElementById('ctx-word-title').textContent = word;
  const domain = res.domain || 'Generale';
  const badge = document.getElementById('ctx-domain-badge');
  const colors = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Generale;
  badge.textContent = domain;
  badge.style.background = colors.bg;
  badge.style.color = colors.color;
  badge.style.border = '1px solid ' + colors.border;
  document.getElementById('ctx-definition').textContent = res.definition || '';
  document.getElementById('ctx-phrase').textContent = res.phrase || '';
  document.getElementById('ctx-detail-body').textContent = res.detail || '';
  document.getElementById('ctx-detail-arrow').classList.remove('open');
  document.getElementById('ctx-detail-body').classList.remove('open');
  showState('result');
}

// ── Panel show/hide ───────────────────────────────────────────────────────────

function showPanel(word) {
  ensurePanel();
  const input = document.getElementById('ctx-search-input');
  if (input) { input.value = word; }
  ['loading', 'error', 'result', 'expired'].forEach(s => {
    document.getElementById('ctx-' + s)?.classList.remove('active');
  });
  panel.classList.add('visible');
  setTimeout(() => input?.focus(), 50);
}

function fetchAndShow(word) {
  showState('loading');
  chrome.runtime.sendMessage(
    { type: 'FETCH_DEFINITION', word, lang: currentLang },
    (response) => {
      if (chrome.runtime.lastError) { showError(chrome.runtime.lastError.message); return; }
      if (response?.success) {
        renderResult(word, response.result);
      } else if (response?.authExpired) {
        authState = { authenticated: false, user: null };
        showState('expired');
        updateFooter();
      } else {
        showError(response?.error || 'Errore sconosciuto');
      }
    }
  );
}

async function triggerSearch() {
  const input = document.getElementById('ctx-search-input');
  const clean = input?.value.trim();
  if (!clean || clean.length < 2) return;
  await refreshAuthState();
  if (!authState.authenticated) {
    showLoginPopup();
    return;
  }
  fetchAndShow(clean);
}

function hidePanel() {
  panel?.classList.remove('visible');
  if (activeSpan) { activeSpan.classList.remove('active'); activeSpan = null; }
}

// ── Login popup (replaces the email verification popup) ───────────────────────

function buildLoginPopup() {
  const overlay = document.createElement('div');
  overlay.id = 'ctx-token-overlay';

  const card = document.createElement('div');
  card.id = 'ctx-token-card';

  // Top row: logo + close button
  const logoRow = document.createElement('div');
  logoRow.className = 'ctx-token-logo';
  const logoDot = document.createElement('div');
  logoDot.className = 'ctx-token-logo-dot';
  const logoText = document.createElement('span');
  logoText.className = 'ctx-token-logo-text';
  logoText.textContent = 'Context';
  logoRow.appendChild(logoDot);
  logoRow.appendChild(logoText);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ctx-token-close';
  closeBtn.setAttribute('aria-label', 'Chiudi');
  closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';
  closeBtn.addEventListener('click', hideLoginPopup);

  const topRow = document.createElement('div');
  topRow.className = 'ctx-token-toprow';
  topRow.appendChild(logoRow);
  topRow.appendChild(closeBtn);

  // Mode tabs (Login / Register)
  const tabs = document.createElement('div');
  tabs.className = 'ctx-mode-tabs';
  const tabLogin = document.createElement('button');
  tabLogin.className = 'ctx-mode-tab active';
  tabLogin.textContent = 'Accedi';
  tabLogin.dataset.mode = 'login';
  const tabRegister = document.createElement('button');
  tabRegister.className = 'ctx-mode-tab';
  tabRegister.textContent = 'Registrati';
  tabRegister.dataset.mode = 'register';
  tabs.appendChild(tabLogin);
  tabs.appendChild(tabRegister);

  // Title / subtitle
  const title = document.createElement('h2');
  title.className = 'ctx-token-title';
  title.textContent = 'Accedi a Context';

  const subtitle = document.createElement('p');
  subtitle.className = 'ctx-token-subtitle';
  subtitle.textContent = 'Stesso account dell\'app mobile e web.';

  // Name input (register-only)
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'ctx-token-name';
  nameInput.placeholder = 'Nome';
  nameInput.setAttribute('autocomplete', 'name');
  nameInput.style.display = 'none';

  // Email + password
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.id = 'ctx-token-input';
  emailInput.placeholder = 'Email';
  emailInput.setAttribute('autocomplete', 'email');
  emailInput.setAttribute('spellcheck', 'false');

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.id = 'ctx-token-password';
  passInput.placeholder = 'Password';
  passInput.setAttribute('autocomplete', 'current-password');

  const errorEl = document.createElement('div');
  errorEl.id = 'ctx-token-error';

  const submitBtn = document.createElement('button');
  submitBtn.id = 'ctx-token-submit';
  submitBtn.textContent = 'Accedi';

  let currentMode = 'login';
  const setMode = (mode) => {
    currentMode = mode;
    tabLogin.classList.toggle('active', mode === 'login');
    tabRegister.classList.toggle('active', mode === 'register');
    nameInput.style.display = mode === 'register' ? 'block' : 'none';
    passInput.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
    submitBtn.textContent = mode === 'login' ? 'Accedi' : 'Inizia prova 7 giorni';
    title.textContent = mode === 'login' ? 'Accedi a Context' : 'Crea il tuo account';
    subtitle.textContent = mode === 'login'
      ? 'Stesso account dell\'app mobile e web.'
      : 'Prova gratuita per 7 giorni, poi €9/mese.';
    errorEl.classList.remove('visible');
  };
  tabLogin.addEventListener('click', () => setMode('login'));
  tabRegister.addEventListener('click', () => setMode('register'));

  const submit = async () => {
    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value;
    const name = nameInput.value.trim();

    if (!email || !email.includes('@') || !email.includes('.')) {
      errorEl.textContent = 'Inserisci un\'email valida.';
      errorEl.classList.add('visible');
      return;
    }
    if (!password || password.length < 4) {
      errorEl.textContent = 'Password troppo corta.';
      errorEl.classList.add('visible');
      return;
    }
    if (currentMode === 'register' && !name) {
      errorEl.textContent = 'Inserisci il tuo nome.';
      errorEl.classList.add('visible');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = currentMode === 'login' ? 'Accesso...' : 'Creazione...';
    errorEl.classList.remove('visible');

    const msgType = currentMode === 'login' ? 'AUTH_LOGIN' : 'AUTH_REGISTER';
    const r = await sendBgMessage({ type: msgType, email, password, name });

    if (r?.ok) {
      authState = { authenticated: true, user: r.user };
      hideLoginPopup();
      updateFooter();
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = currentMode === 'login' ? 'Accedi' : 'Inizia prova 7 giorni';
      errorEl.textContent = r?.error || 'Errore. Riprova.';
      errorEl.classList.add('visible');
    }
  };

  submitBtn.addEventListener('click', submit);
  [nameInput, emailInput, passInput].forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      errorEl.classList.remove('visible');
    });
  });

  const divider = document.createElement('div');
  divider.className = 'ctx-token-divider';

  const cta = document.createElement('div');
  cta.className = 'ctx-token-cta';
  cta.textContent = 'Un solo account su mobile, web ed estensione Chrome.';

  card.appendChild(topRow);
  card.appendChild(tabs);
  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(nameInput);
  card.appendChild(emailInput);
  card.appendChild(passInput);
  card.appendChild(errorEl);
  card.appendChild(submitBtn);
  card.appendChild(divider);
  card.appendChild(cta);

  overlay.appendChild(card);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideLoginPopup();
  });

  document.body.appendChild(overlay);
  setTimeout(() => emailInput.focus(), 50);
  return overlay;
}

function showLoginPopup() {
  if (document.getElementById('ctx-token-overlay')) return;
  buildLoginPopup();
}

function hideLoginPopup() {
  document.getElementById('ctx-token-overlay')?.remove();
}

// ── Subtitle word wrapping ────────────────────────────────────────────────────

function createWordSpan(word) {
  const span = document.createElement('span');
  span.className = 'context-word';
  span.textContent = word;
  span.addEventListener('click', async (e) => {
    e.stopPropagation();
    const clean = word.replace(/[^\p{L}\p{N}'-]/gu, '').trim();
    if (!clean || clean.length < 2) return;

    await refreshAuthState();
    if (!authState.authenticated) {
      showLoginPopup();
      return;
    }

    if (activeSpan) activeSpan.classList.remove('active');
    activeSpan = span;
    span.classList.add('active');
    showPanel(clean);
    fetchAndShow(clean);
  });
  return span;
}

function processTextNode(textNode) {
  if (textNode.parentElement?.classList.contains('context-word')) return;
  const text = textNode.textContent;
  if (!text.trim()) return;
  const parts = text.split(/(\s+)/);
  if (parts.length === 1) {
    if (text.trim()) {
      textNode.parentNode.replaceChild(createWordSpan(text), textNode);
      wordCount++;
    }
    return;
  }
  const frag = document.createDocumentFragment();
  parts.forEach(p => {
    if (/^\s*$/.test(p)) frag.appendChild(document.createTextNode(p));
    else { frag.appendChild(createWordSpan(p)); wordCount++; }
  });
  textNode.parentNode.replaceChild(frag, textNode);
}

function processContainer(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.classList.contains('context-word')) return NodeFilter.FILTER_REJECT;
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  let n;
  while (n = walker.nextNode()) nodes.push(n);
  nodes.forEach(processTextNode);
  updateStatus(true, wordCount);
}

function scheduleContainer(el) {
  clearTimeout(pendingContainers.get(el));
  pendingContainers.set(el, setTimeout(() => {
    processContainer(el);
    pendingContainers.delete(el);
  }, 300));
}

// ── Subtitle detection ────────────────────────────────────────────────────────

function matchesSubtitle(el) {
  for (const sel of SUBTITLE_SELECTORS) {
    try { if (el.matches(sel)) return sel; } catch (_) {}
  }
  return null;
}

function findSubtitleContainer(el) {
  if (!el) return null;
  for (const sel of SUBTITLE_SELECTORS) {
    try {
      const found = el.closest?.(sel);
      if (found) return found;
      if (el.matches?.(sel)) return el;
    } catch (_) {}
  }
  return null;
}

function isInSubtitles(node) {
  if (!node) return false;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!el) return false;
  if (el.closest('.context-word')) return true;
  return !!findSubtitleContainer(el);
}

function queryShadowAll(root, selector, results = []) {
  let matches;
  try { matches = root.querySelectorAll(selector); } catch (_) { matches = []; }
  results.push(...matches);
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) queryShadowAll(el.shadowRoot, selector, results);
  });
  return results;
}

function scanDocument() {
  let found = false;
  const queryFn = PLATFORM === 'teams'
    ? (sel) => queryShadowAll(document.body, sel)
    : (sel) => { try { return [...document.querySelectorAll(sel)]; } catch (_) { return []; } };

  for (const sel of SUBTITLE_SELECTORS) {
    queryFn(sel).forEach(el => {
      if (el.id === 'ctx-panel' || el.id === 'ctx-status') return;
      if (!knownContainers.has(el)) {
        knownContainers.add(el);
        console.log('[Context] sottotitolo trovato con selettore:', sel, el);
        scheduleContainer(el);
        found = true;
      }
    });
  }
  if (!found && wordCount === 0) updateStatus(false, 0);
}

// ── MutationObserver ──────────────────────────────────────────────────────────

const observer = new MutationObserver((mutations) => {
  const seen = new Set();
  for (const m of mutations) {
    let target = m.target;
    if (m.type === 'characterData') target = target.parentElement;

    const container = findSubtitleContainer(target);
    if (container && !seen.has(container)) {
      seen.add(container);
      if (!knownContainers.has(container)) {
        knownContainers.add(container);
        const matchedSel = matchesSubtitle(container) || '(ancestor match)';
        console.log('[Context] nuovo container rilevato via observer:', matchedSel, container);
      }
      scheduleContainer(container);
    }

    if (m.type === 'childList') {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        for (const sel of SUBTITLE_SELECTORS) {
          let els;
          try { els = node.querySelectorAll(sel); } catch (_) { continue; }
          els.forEach(el => {
            if (!seen.has(el)) {
              seen.add(el);
              if (!knownContainers.has(el)) {
                knownContainers.add(el);
                console.log('[Context] sottotitolo nel nuovo nodo, selettore:', sel, el);
              }
              scheduleContainer(el);
            }
          });
          try {
            if (node.matches?.(sel) && !seen.has(node)) {
              seen.add(node);
              if (!knownContainers.has(node)) {
                knownContainers.add(node);
                console.log('[Context] nodo aggiunto è sottotitolo, selettore:', sel, node);
              }
              scheduleContainer(node);
            }
          } catch (_) {}
        }
      });
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

initAuth();

statusBadge = buildStatusBadge();
console.log('[Context] estensione attiva su', location.href);

chrome.storage.local.get('ctx_lang', (res) => {
  if (res.ctx_lang && LANGUAGES.some(l => l.code === res.ctx_lang)) {
    currentLang = res.ctx_lang;
    updateLangUI();
  }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

scanDocument();
setInterval(scanDocument, 3000);

document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePanel(); });

document.addEventListener('mouseup', async () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || text.length < 2) return;
  if (!isInSubtitles(selection.anchorNode)) return;

  const clean = text.replace(/\s+/g, ' ');
  selection.removeAllRanges();

  await refreshAuthState();
  if (!authState.authenticated) {
    showLoginPopup();
    return;
  }

  if (activeSpan) { activeSpan.classList.remove('active'); activeSpan = null; }
  showPanel(clean);
  fetchAndShow(clean);
});
