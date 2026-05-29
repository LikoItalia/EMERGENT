// Centralized theme + API helpers for Context app.
import { storage } from "@/src/utils/storage";

export const C = {
  bg: "#050508",
  surface: "#111115",
  surfaceElev: "#1A1A24",
  primary: "#7c50ff",
  primaryDim: "rgba(124,80,255,0.18)",
  primaryGlow: "rgba(124,80,255,0.35)",
  text: "#FFFFFF",
  textDim: "#A1A1AA",
  textMuted: "#71717A",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.12)",
};

export const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Finance: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)", text: "#4ade80" },
  Tech: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
  Legal: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", text: "#fbbf24" },
  Marketing: { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.35)", text: "#f472b6" },
  Strategy: { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", text: "#fb923c" },
  HR: { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.35)", text: "#22d3ee" },
  Medicina: { bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.35)", text: "#fb7185" },
  Scienza: { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.35)", text: "#c084fc" },
  Sport: { bg: "rgba(132,204,22,0.12)", border: "rgba(132,204,22,0.35)", text: "#a3e635" },
  Arte: { bg: "rgba(217,70,239,0.12)", border: "rgba(217,70,239,0.35)", text: "#e879f9" },
  Politica: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", text: "#f87171" },
  Generale: { bg: "rgba(161,161,170,0.12)", border: "rgba(161,161,170,0.35)", text: "#d4d4d8" },
};

export const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "context_auth_token";

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet(TOKEN_KEY, "")) || null;
}
export async function setToken(t: string) {
  await storage.secureSet(TOKEN_KEY, t);
}
export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean; isForm?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true, isForm = false } = opts;
  const headers: any = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = await getToken();
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
