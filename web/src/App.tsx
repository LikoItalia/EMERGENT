import { useState } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { AuthScreen } from "./pages/Auth";
import { Subtitles } from "./pages/Subtitles";
import { Library } from "./pages/Library";
import { Settings } from "./pages/Settings";
import { ContextLogo } from "./components/ContextLogo";

type Tab = "subtitles" | "library" | "settings";

function Shell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("subtitles");

  if (loading) {
    return (
      <>
        <div className="bg-glow" />
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", position: "relative", zIndex: 1 }}>
          <ContextLogo size={64} />
        </div>
      </>
    );
  }
  if (!user) return <AuthScreen />;

  const trialDays = user.subscription_status === "trial"
    ? Math.max(0, Math.ceil((new Date(user.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <>
      <div className="bg-glow" />
      <div className="app">
        <header className="top">
          <div className="brand">
            <div className="brand-logo"><ContextLogo size={36} /></div>
            <span className="brand-name">Context</span>
          </div>
          <nav className="nav" aria-label="Tabs">
            <button data-testid="tab-subtitles" className={tab === "subtitles" ? "active" : ""} onClick={() => setTab("subtitles")}>
              <span className="nav-label">Sottotitoli</span>
            </button>
            <button data-testid="tab-library" className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>
              <span className="nav-label">Libreria</span>
            </button>
            <button data-testid="tab-settings" className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
              <span className="nav-label">Impostazioni</span>
            </button>
          </nav>
          <div className="top-right">
            {user.subscription_status === "trial" && (
              <span className="chip">Pro Trial · {trialDays}g</span>
            )}
            {user.subscription_status === "active" && <span className="chip active">Pro attivo</span>}
            {user.subscription_status === "expired" && <span className="chip expired">Prova scaduta</span>}
          </div>
        </header>

        <main>
          {tab === "subtitles" && <Subtitles />}
          {tab === "library" && <Library />}
          {tab === "settings" && <Settings />}
        </main>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
