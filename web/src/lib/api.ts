// Backend API client — same JWT scheme as the mobile app.
export const API_URL = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "context_auth_token";

export type User = {
  id: string;
  email: string;
  name: string;
  subscription_status: string;
  trial_ends_at: string;
  language: string;
};

export type SavedWord = {
  id: string;
  word: string;
  definition: string;
  domain: string;
  what_to_say: string;
  language: string;
  created_at: string;
};

export const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Finance: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", text: "var(--d-finance)" },
  Tech: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", text: "var(--d-tech)" },
  Legal: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", text: "var(--d-legal)" },
  Marketing: { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.35)", text: "var(--d-marketing)" },
  Strategy: { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", text: "var(--d-strategy)" },
  HR: { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.35)", text: "var(--d-hr)" },
  Medicina: { bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.35)", text: "var(--d-medicina)" },
  Scienza: { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)", text: "var(--d-scienza)" },
  Sport: { bg: "rgba(132,204,22,0.12)", border: "rgba(132,204,22,0.35)", text: "var(--d-sport)" },
  Arte: { bg: "rgba(217,70,239,0.12)", border: "rgba(217,70,239,0.35)", text: "var(--d-arte)" },
  Politica: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", text: "var(--d-politica)" },
  Generale: { bg: "rgba(161,161,170,0.12)", border: "rgba(161,161,170,0.35)", text: "var(--d-generale)" },
};

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; isForm?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true, isForm = false } = opts;
  const headers: Record<string, string> = {};
  if (!isForm && body) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}
