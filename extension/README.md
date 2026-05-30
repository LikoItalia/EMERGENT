# Context — Chrome Extension

Estensione Manifest V3 che si inietta su **Google Meet** e **Microsoft Teams** e legge i sottotitoli nativi della piattaforma. Click su una parola → definizione AI + auto-salvata nella **libreria condivisa** con l'app mobile e web.

## Struttura

```
extension/
├── manifest.json     ← MV3 — Meet + Teams
├── background.js     ← Service worker · JWT + /api/explain + auto-save
├── content.js        ← Subtitle reader · login popup · panel
├── style.css         ← Dark theme · viola #7c50ff
├── icons/            ← 16/48/128 px
└── README.md
```

## Flusso di autenticazione

1. Apri Meet o Teams → l'estensione mostra il **popup di login** (tab "Accedi" / "Registrati")
2. L'utente inserisce **email + password** → `AUTH_LOGIN` → `POST /api/auth/login`
3. Il JWT viene salvato in `chrome.storage.local` (chiave `ctx_jwt`)
4. Tutte le successive chiamate `/api/*` includono `Authorization: Bearer <jwt>`

**Stesso identico backend** (`/api/auth/login`, `/api/explain`, `/api/library/save`) usato da:
- App mobile Expo (`/app/frontend`)
- Web app Vercel (`/app/web`)
- Estensione Chrome (`/app/extension`)

Una parola cliccata su Meet appare **immediatamente** nella libreria del mobile e del web.

## Sottotitoli supportati

| Piattaforma | Selettori |
|---|---|
| Google Meet | `[jsname="tgaKEf"]`, `.a4cQT`, `.iOzk7`, `[class*="caption"]`, etc. |
| Microsoft Teams | `[data-tid="closed-caption-text"]`, `.ts-captions-container span`, shadow DOM walker |

Il content script processa ogni text node in clickable spans, wrappa ogni parola, e usa un `MutationObserver` per intercettare i nuovi sottotitoli in tempo reale.

## Backend usato (default)

`https://premium-subtitles.preview.emergentagent.com`

Puoi cambiarlo a runtime mandando il messaggio `SET_API_URL` al service worker (utile in produzione).

## Endpoint chiamati

| Endpoint | Quando |
|---|---|
| `POST /api/auth/login` | Login dal popup |
| `POST /api/auth/register` | Registrazione dal popup (trial 7 giorni) |
| `POST /api/explain` | Click su parola → Claude Haiku |
| `POST /api/library/save` | Auto-save dopo `/api/explain` (fire-and-forget) |

## Caricamento locale per testing

1. `chrome://extensions/` → attiva "Modalità sviluppatore"
2. "Carica estensione non pacchettizzata" → seleziona `/app/extension`
3. Apri `meet.google.com` o `teams.microsoft.com` → appare il popup viola
4. Accedi con `test@context.app` / `test12345`
5. Attiva i sottotitoli nativi della piattaforma → ogni parola è cliccabile

## Pubblicazione su Chrome Web Store

1. Zippa il contenuto della cartella `extension/`
2. Carica su https://chrome.google.com/webstore/devconsole
3. URL privacy policy: ottenuto deployando `/app/web/public/privacy.html` su Vercel

## Differenze dalla versione originale dell'utente

- ❌ Rimossa la chiamata diretta a `api.anthropic.com` con API key hardcoded
- ❌ Rimosso il sistema `VERIFY_EMAIL` su backend separato `context-backend-three.vercel.app`
- ❌ Rimosso `TOKEN_CACHE_MS` (il JWT è long-lived)
- ✅ Aggiunto login JWT con email + password
- ✅ Aggiunto registrazione inline con trial 7 giorni
- ✅ Aggiunto auto-save in libreria dopo ogni `explain`
- ✅ Aggiunto footer con account corrente + logout nel panel
- ✅ Aggiornato colore primario da `#6d28d9` (viola Tailwind) a `#7c50ff` (viola Context)
