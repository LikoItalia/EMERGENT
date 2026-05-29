import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setToken, type User } from "./api";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setLanguage: (lang: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const t = getToken();
      if (!t) { setUser(null); return; }
      const u = await api<User>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
      clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST", body: { email, password }, auth: false,
    });
    setToken(r.access_token);
    setUser(r.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const r = await api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST", body: { email, password, name }, auth: false,
    });
    setToken(r.access_token);
    setUser(r.user);
  };

  const logout = () => { clearToken(); setUser(null); };

  const setLanguage = async (lang: string) => {
    await api("/auth/language", { method: "PATCH", body: { language: lang } });
    setUser((u) => (u ? { ...u, language: lang } : u));
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh, setLanguage }}>
      {children}
    </Ctx.Provider>
  );
};

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth requires AuthProvider");
  return c;
}
