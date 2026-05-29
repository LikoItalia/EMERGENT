/* Context — Google Meet content script.
 * Reads the native captions Meet renders inside [aria-live="polite"] regions,
 * extracts new tokens via diff, renders a clickable overlay, and on click
 * calls /api/explain via the service worker (which also auto-saves to /api/library).
 */

(() => {
  if (window.__contextInjected__) return;
  window.__contextInjected__ = true;

  // ---------- State ----------
  const MAX_WORDS = 80;            // visible word window in the overlay
  const POLL_MS = 350;             // throttled diff polling for caption text
  let collectedWords = [];         // tokens displayed in overlay
  let speakerBuffer = new Map();   // speakerKey -> last full text we already ingested
  let overlayVisible = false;
  let collapsed = false;

  // ---------- DOM bootstrap ----------
  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "ctx-overlay";
    overlay.innerHTML = `
      <div class="ctx-bar">
        <div class="ctx-bar-left">
          <span class="ctx-dot"></span>
          <span>Context · sottotitoli</span>
        </div>
        <div class="ctx-bar-actions">
          <button id="ctx-clear" class="ctx-icon-btn" title="Pulisci">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
          <button id="ctx-min" class="ctx-icon-btn" title="Minimizza">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button id="ctx-close" class="ctx-icon-btn" title="Chiudi">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="ctx-stream" id="ctx-stream">
        <div class="ctx-empty" id="ctx-empty">
          Attiva i <b>sottotitoli</b> di Meet (icona <span class="ctx-hint-key">CC</span> in basso). Quando appariranno qui, tocca una parola per scoprirla.
        </div>
        <div class="ctx-words" id="ctx-words"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    const pill = document.createElement("div");
    pill.id = "ctx-pill";
    pill.innerHTML = `<span class="ctx-pill-dot"></span><span>Context</span>`;
    document.documentElement.appendChild(pill);

    overlay.querySelector("#ctx-close").onclick = hideOverlay;
    overlay.querySelector("#ctx-min").onclick = collapseOverlay;
    overlay.querySelector("#ctx-clear").onclick = () => {
      collectedWords = [];
      renderWords();
    };
    overlay.querySelector("#ctx-words").addEventListener("click", onWordClick);
    pill.addEventListener("click", expandOverlay);
  }

  function buildSheet() {
    const back = document.createElement("div");
    back.id = "ctx-sheet-backdrop";
    back.innerHTML = `
      <div class="ctx-sheet" id="ctx-sheet">
        <button class="ctx-sheet-close" id="ctx-sheet-close" aria-label="Chiudi">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="ctx-sheet-head">
          <div class="ctx-sheet-word" id="ctx-sheet-word">…</div>
          <span class="ctx-badge" id="ctx-sheet-badge" style="display:none;"></span>
        </div>
        <div id="ctx-sheet-body"></div>
      </div>
    `;
    document.documentElement.appendChild(back);

    back.addEventListener("click", (e) => {
      if (e.target === back) hideSheet();
    });
    back.querySelector("#ctx-sheet-close").onclick = hideSheet;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && back.classList.contains("ctx-visible")) hideSheet();
    });
  }

  function showOverlay() {
    overlayVisible = true;
    collapsed = false;
    document.getElementById("ctx-overlay").classList.add("ctx-visible");
    document.getElementById("ctx-pill").classList.remove("ctx-visible");
  }
  function hideOverlay() {
    overlayVisible = false;
    document.getElementById("ctx-overlay").classList.remove("ctx-visible");
    document.getElementById("ctx-pill").classList.remove("ctx-visible");
  }
  function collapseOverlay() {
    collapsed = true;
    document.getElementById("ctx-overlay").classList.remove("ctx-visible");
    document.getElementById("ctx-pill").classList.add("ctx-visible");
  }
  function expandOverlay() { showOverlay(); }

  function showSheet() {
    document.getElementById("ctx-sheet-backdrop").classList.add("ctx-visible");
  }
  function hideSheet() {
    document.getElementById("ctx-sheet-backdrop").classList.remove("ctx-visible");
  }

  // ---------- Caption observation ----------
  // Google Meet renders live captions inside elements marked with
  // aria-live="polite". The exact obfuscated class names change frequently,
  // so we rely on the stable ARIA contract rather than CSS selectors.
  function findCaptionRegions() {
    const list = document.querySelectorAll('[aria-live="polite"]');
    const out = [];
    list.forEach((el) => {
      // Skip our own overlay/sheet roots
      if (el.closest("#ctx-overlay") || el.closest("#ctx-sheet-backdrop")) return;
      const t = el.innerText?.trim();
      if (!t) return;
      // Heuristic: caption regions live near the bottom half of the viewport
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) return;
      // Crude filter to keep only "speech-like" content; skip very short labels
      if (t.length < 2) return;
      out.push(el);
    });
    return out;
  }

  // Map each region to a stable key so we can diff against the last text.
  function regionKey(el) {
    // Prefer speaker name in nearby labelledby region; else element identity
    const labelled = el.closest('[data-self-name], [data-tooltip], [data-participant-id]');
    if (labelled) {
      const id = labelled.getAttribute("data-participant-id")
        || labelled.getAttribute("data-self-name")
        || labelled.getAttribute("data-tooltip");
      if (id) return `p:${id}`;
    }
    // Fall back to a hash based on position + DOM path index
    if (!el.__ctxKey) el.__ctxKey = "el:" + Math.random().toString(36).slice(2, 10);
    return el.__ctxKey;
  }

  function ingestNewText(speakerKey, fullText) {
    const previous = speakerBuffer.get(speakerKey) || "";
    if (fullText === previous) return;

    // If the new text is a prefix or extension of the old one, only emit the suffix
    let delta = fullText;
    if (fullText.startsWith(previous)) {
      delta = fullText.slice(previous.length).trim();
    } else if (previous && previous.length > 20) {
      // Find the longest overlap from the end of previous with start of fullText
      const overlap = findOverlap(previous, fullText);
      delta = fullText.slice(overlap).trim();
    }
    speakerBuffer.set(speakerKey, fullText);
    if (!delta) return;

    const tokens = delta.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    collectedWords.push(...tokens);
    if (collectedWords.length > MAX_WORDS) {
      collectedWords = collectedWords.slice(-MAX_WORDS);
    }
    if (!overlayVisible && !collapsed) showOverlay();
    if (collapsed) {
      // Keep pill visible to indicate activity
      document.getElementById("ctx-pill").classList.add("ctx-visible");
    }
    renderWords();
  }

  function findOverlap(a, b) {
    const max = Math.min(a.length, b.length, 200);
    for (let i = max; i > 0; i--) {
      if (a.endsWith(b.slice(0, i))) return i;
    }
    return 0;
  }

  function renderWords() {
    const root = document.getElementById("ctx-words");
    const empty = document.getElementById("ctx-empty");
    if (!root) return;
    if (collectedWords.length === 0) {
      empty.style.display = "block";
      root.innerHTML = "";
      return;
    }
    empty.style.display = "none";
    root.innerHTML = collectedWords
      .map((w, i) => `<span class="ctx-word" data-i="${i}">${escapeHtml(w)}</span>`)
      .join("");
    const stream = document.getElementById("ctx-stream");
    stream.scrollTop = stream.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Word click → explain ----------
  async function onWordClick(e) {
    const t = e.target;
    if (!t.classList?.contains("ctx-word")) return;
    const idx = parseInt(t.dataset.i, 10);
    const raw = collectedWords[idx];
    if (!raw) return;
    const clean = raw.replace(/[.,!?;:"'()\[\]…]/g, "").trim();
    if (!clean) return;

    // Build context window for the explanation
    const start = Math.max(0, idx - 18);
    const end = Math.min(collectedWords.length, idx + 6);
    const ctx = collectedWords.slice(start, end).join(" ");

    // Check auth first; redirect to popup if not signed in
    const state = await sendMessage({ type: "AUTH_STATE" });
    if (!state?.authenticated) {
      openSheetLoggedOut();
      return;
    }

    openSheetLoading(clean);

    const lang = state.user?.language || "it";
    const resp = await sendMessage({ type: "EXPLAIN", word: clean, context: ctx, language: lang });
    if (!resp?.ok) {
      openSheetError(clean, resp?.error || "Errore");
      return;
    }
    renderSheet(resp.data);
    t.classList.add("ctx-saved");
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(r));
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  function openSheetLoading(word) {
    document.getElementById("ctx-sheet-word").textContent = word;
    document.getElementById("ctx-sheet-badge").style.display = "none";
    document.getElementById("ctx-sheet-body").innerHTML = `<div class="ctx-loading">Sto pensando…</div>`;
    showSheet();
  }
  function openSheetError(word, msg) {
    document.getElementById("ctx-sheet-word").textContent = word;
    document.getElementById("ctx-sheet-body").innerHTML = `<div class="ctx-def" style="color:#f87171;">${escapeHtml(msg)}</div>`;
    showSheet();
  }
  function openSheetLoggedOut() {
    document.getElementById("ctx-sheet-word").textContent = "Accedi";
    document.getElementById("ctx-sheet-badge").style.display = "none";
    document.getElementById("ctx-sheet-body").innerHTML = `
      <div class="ctx-def">Apri l'estensione Context (icona in alto a destra) e accedi con il tuo account.</div>
      <p class="ctx-save-status">Stesso account dell'app mobile e web.</p>
    `;
    showSheet();
  }

  const DOMAIN_COLORS = {
    Finance:   { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.35)",  text: "#4ade80" },
    Tech:      { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
    Legal:     { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", text: "#fbbf24" },
    Marketing: { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.35)", text: "#f472b6" },
    Strategy:  { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", text: "#fb923c" },
    HR:        { bg: "rgba(6,182,212,0.12)",  border: "rgba(6,182,212,0.35)",  text: "#22d3ee" },
    Medicina:  { bg: "rgba(244,63,94,0.12)",  border: "rgba(244,63,94,0.35)",  text: "#fb7185" },
    Scienza:   { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)", text: "#c084fc" },
    Sport:     { bg: "rgba(132,204,22,0.12)", border: "rgba(132,204,22,0.35)", text: "#a3e635" },
    Arte:      { bg: "rgba(217,70,239,0.12)", border: "rgba(217,70,239,0.35)", text: "#e879f9" },
    Politica:  { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  text: "#f87171" },
    Generale:  { bg: "rgba(161,161,170,0.12)",border: "rgba(161,161,170,0.35)",text: "#d4d4d8" },
  };

  function renderSheet(data) {
    const dc = DOMAIN_COLORS[data.domain] || DOMAIN_COLORS.Generale;
    document.getElementById("ctx-sheet-word").textContent = data.word;
    const badge = document.getElementById("ctx-sheet-badge");
    badge.textContent = data.domain;
    badge.style.background = dc.bg;
    badge.style.borderColor = dc.border;
    badge.style.color = dc.text;
    badge.style.display = "inline-block";

    document.getElementById("ctx-sheet-body").innerHTML = `
      <div class="ctx-label">Definizione</div>
      <div class="ctx-def">${escapeHtml(data.definition || "")}</div>
      ${data.what_to_say ? `
        <div class="ctx-label" style="margin-top:18px;">Cosa dire</div>
        <div class="ctx-say"><div class="ctx-say-text">${escapeHtml(data.what_to_say)}</div></div>
      ` : ""}
      <div class="ctx-save-status ok">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Salvato nella tua libreria · sincronizzato con mobile e web
      </div>
    `;
  }

  // ---------- Polling loop ----------
  function pollLoop() {
    try {
      const regions = findCaptionRegions();
      for (const el of regions) {
        const txt = el.innerText.replace(/\s+/g, " ").trim();
        if (!txt) continue;
        ingestNewText(regionKey(el), txt);
      }
    } catch (e) {
      // Be silent — Meet rebuilds DOM aggressively
    }
  }

  // ---------- Init ----------
  function init() {
    buildOverlay();
    buildSheet();

    // First poll loop using a throttled interval. We also use a MutationObserver
    // to react quickly while the polling loop guarantees state convergence.
    setInterval(pollLoop, POLL_MS);

    const mo = new MutationObserver(() => {
      // Throttle by rAF; the interval will catch up regardless.
      if (window.__ctxRaf__) return;
      window.__ctxRaf__ = requestAnimationFrame(() => {
        window.__ctxRaf__ = null;
        pollLoop();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Show overlay when captions are turned on; until then keep it hidden so we
    // don't clutter the screen. We auto-show on the first detected word.
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
