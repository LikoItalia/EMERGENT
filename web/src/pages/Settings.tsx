import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ICheck, ILogout, IExternal, ISparkles } from "../components/Icons";

const LANGS = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

export function Settings() {
  const { user, logout, setLanguage } = useAuth();
  const [billing, setBilling] = useState<{ status: string; days_left: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ status: string; days_left: number }>("/billing/status").then(setBilling).catch(() => {});
    // Auto-refresh on tab visibility (helpful after returning from Stripe checkout)
    const onVis = () => {
      if (document.visibilityState === "visible") {
        api<any>("/billing/status").then(setBilling).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const upgrade = async () => {
    setBusy(true);
    try {
      const r = await api<{ checkout_url: string }>("/billing/create-checkout-session", { method: "POST" });
      window.open(r.checkout_url, "_blank", "noopener");
    } catch (e: any) {
      alert("Errore: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel =
    billing?.status === "trial" ? `Prova · ${billing.days_left} ${billing.days_left === 1 ? "giorno" : "giorni"} rimasti`
    : billing?.status === "active" ? "Attivo · €9/mese"
    : billing?.status === "expired" ? "Prova terminata"
    : "—";

  return (
    <div className="container">
      <h1>Impostazioni</h1>
      <div className="spacer-md" />

      <p className="tiny-label">Account</p>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <h3>{user?.name || "Utente"}</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{user?.email}</p>
          </div>
        </div>
      </div>

      <p className="tiny-label">Abbonamento</p>
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <h3 className="row" style={{ gap: 8 }}>
              <ISparkles width={16} height={16} style={{ color: "var(--primary)" }} /> Context Pro
            </h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{statusLabel}</p>
          </div>
          {billing?.status !== "active" && (
            <button data-testid="upgrade-btn" className="upgrade-btn" onClick={upgrade} disabled={busy}>
              <span className="row" style={{ gap: 6 }}>
                Passa a Pro <IExternal width={14} height={14} />
              </span>
            </button>
          )}
        </div>
      </div>

      <p className="tiny-label">Lingua</p>
      <div className="settings-card">
        {LANGS.map((l) => (
          <div
            key={l.code}
            data-testid={`lang-${l.code}`}
            className="lang-row"
            onClick={() => setLanguage(l.code)}
          >
            <span className="flag">{l.flag}</span>
            <span className="label">{l.label}</span>
            {user?.language === l.code && <ICheck style={{ color: "var(--primary)" }} />}
          </div>
        ))}
      </div>

      <p className="tiny-label">Sessione</p>
      <button data-testid="logout-btn" className="logout-row" onClick={() => { if (confirm("Vuoi davvero uscire?")) logout(); }}>
        <ILogout /> Esci
      </button>

      <p className="note" style={{ marginTop: 28 }}>
        Context · Web v1.0 · Stesso account dell'app mobile · Powered by Whisper + Claude
      </p>
    </div>
  );
}
