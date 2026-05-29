# Context — Chrome Extension

Estensione Manifest V3 che si inietta su **meet.google.com** e legge i sottotitoli nativi di Google Meet tramite `MutationObserver` (nessun audio catturato, nessun Whisper). Click su una parola → definizione AI + auto-salvata nella libreria condivisa con l'app mobile e web.

## Architettura

```
extension/
├── manifest.json           ← MV3, content_script su meet.google.com
├── background/
│   └── service-worker.js   ← Source of truth per JWT, parla con /api
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js            ← Login/registrazione, gestione account + Stripe
├── content/
│   ├── content.css         ← Overlay glassmorphism viola
│   └── content.js          ← Lettura captions Meet + click → /api/explain
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Flusso di autenticazione

1. L'utente clicca l'icona dell'estensione → popup → inserisce email/password
2. `popup.js` invia `AUTH_LOGIN` al service worker → `POST /api/auth/login`
3. Il JWT viene salvato in `chrome.storage.local` (`context_token`)
4. Quando l'utente clicca una parola, il content script chiede al service worker, che inietta `Authorization: Bearer <jwt>` su tutte le chiamate

**Stesso endpoint, stesso JWT, stesso utente** dell'app mobile (`/app/frontend`) e della web app Vercel (`/app/web`). La libreria è condivisa al 100%: una parola salvata da Meet appare immediatamente nell'app mobile e nella web app.

## Come legge i sottotitoli di Meet

Google Meet renderizza i sottotitoli dentro elementi `[aria-live="polite"]` (contratto ARIA stabile, indipendente dai nomi delle classi offuscati). Il content script:

1. Esegue `document.querySelectorAll('[aria-live="polite"]')` ogni 350 ms + MutationObserver
2. Per ogni regione, calcola un *delta* rispetto al testo già visto (`speakerBuffer`)
3. Aggiunge solo le nuove parole nell'overlay (finestra di 80 parole rolling)

Niente audio, niente trascrizione → costo zero, latenza zero, privacy completa.

## Caricamento locale (per testing)

1. Apri `chrome://extensions/`
2. Attiva **"Modalità sviluppatore"** (toggle in alto a destra)
3. Click **"Carica estensione non pacchettizzata"** → seleziona la cartella `/app/extension`
4. L'icona "C" viola appare nella barra estensioni → click → accedi con `test@context.app` / `test12345`
5. Apri `https://meet.google.com/...` e abilita i sottotitoli (CC) → l'overlay viola appare automaticamente

## Pubblicazione su Chrome Web Store

1. Cambia `host_permissions` con l'URL backend di produzione
2. Zippa il contenuto della cartella `extension/` (NON la cartella stessa)
3. Carica su https://chrome.google.com/webstore/devconsole (one-time $5 dev fee)

## Endpoint usati

| Endpoint | Quando |
|---|---|
| `POST /api/auth/login` | Login dal popup |
| `POST /api/auth/register` | Registrazione dal popup (trial 7 giorni) |
| `GET /api/auth/me` | Refresh sessione all'apertura del popup |
| `GET /api/billing/status` | Mostra chip "Pro Trial · Xg" |
| `POST /api/billing/create-checkout-session` | Pulsante "Passa a Pro" |
| `POST /api/explain` | Click su parola → Claude Haiku |
| `POST /api/library/save` | Auto-save dopo `/api/explain` (best-effort, fire-and-forget) |
