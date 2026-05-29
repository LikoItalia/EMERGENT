import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ContextLogo } from "../components/ContextLogo";
import { IMail, ILock, IUser } from "../components/Icons";

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (mode === "register" && !name)) {
      setErr("Compila tutti i campi");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
    } catch (e: any) {
      setErr(e.message || "Errore");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="bg-glow" />
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo"><ContextLogo size={56} /></div>
          <h1 className="auth-title">Context</h1>
          <p className="auth-sub">Capisci ogni parola. In tempo reale.</p>

          <div className="tabs">
            <button
              type="button"
              data-testid="tab-login"
              className={mode === "login" ? "active" : ""}
              onClick={() => setMode("login")}
            >Accedi</button>
            <button
              type="button"
              data-testid="tab-register"
              className={mode === "register" ? "active" : ""}
              onClick={() => setMode("register")}
            >Registrati</button>
          </div>

          <form onSubmit={submit}>
            {mode === "register" && (
              <div className="field">
                <IUser />
                <input
                  data-testid="input-name"
                  type="text" placeholder="Nome"
                  value={name} onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <IMail />
              <input
                data-testid="input-email"
                type="email" placeholder="Email"
                autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <ILock />
              <input
                data-testid="input-password"
                type="password" placeholder="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {err && <p className="err">{err}</p>}

            <button data-testid="submit-btn" type="submit" className="cta" disabled={loading}>
              {loading ? "Attendi…" : mode === "login" ? "Accedi" : "Inizia prova gratis di 7 giorni"}
            </button>

            <p className="note">
              {mode === "register"
                ? "Dopo 7 giorni, abbonamento Pro a €9/mese. Annulli quando vuoi."
                : "Stesso account dell'app mobile."}
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
