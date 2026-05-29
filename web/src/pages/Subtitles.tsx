import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { ChunkRecorder } from "../lib/recorder";
import { useAuth } from "../lib/auth";
import { WordSheet } from "../components/WordSheet";
import { IMic } from "../components/Icons";

export function Subtitles() {
  const { user } = useAuth();
  const lang = user?.language || "it";
  const [recording, setRecording] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [sending, setSending] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const recRef = useRef<ChunkRecorder | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sel, setSel] = useState({ word: "", definition: "", domain: "Generale", whatToSay: "" });

  useEffect(() => () => recRef.current?.stop(), []);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [words]);

  const transcribeChunk = useCallback(async (blob: Blob, mimeType: string) => {
    setSending((s) => s + 1);
    try {
      const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("ogg") ? "ogg" : "mp4";
      const form = new FormData();
      form.append("file", blob, `chunk-${Date.now()}.${ext}`);
      const r = await api<{ text: string }>(`/transcribe?language=${lang}`, {
        method: "POST", body: form, isForm: true,
      });
      if (r.text && r.text.trim()) {
        const newW = r.text.trim().split(/\s+/).filter(Boolean);
        setWords((w) => [...w, ...newW]);
      }
    } catch (e) {
      console.warn("transcribe error", e);
    } finally {
      setSending((s) => Math.max(0, s - 1));
    }
  }, [lang]);

  const start = async () => {
    setPermissionError(null);
    setWords([]);
    try {
      const rec = new ChunkRecorder({
        chunkMs: 4000,
        onChunk: transcribeChunk,
        onError: (e) => console.warn("recorder err", e),
      });
      await rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (e: any) {
      const msg = e?.name === "NotAllowedError"
        ? "Permesso microfono negato. Abilitalo nelle impostazioni del browser."
        : e?.message || "Impossibile avviare la registrazione";
      setPermissionError(msg);
    }
  };

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  const onWordClick = async (raw: string) => {
    const clean = raw.replace(/[.,!?;:"'()[\]]/g, "").trim();
    if (!clean) return;
    setSel({ word: clean, definition: "", domain: "Generale", whatToSay: "" });
    setSheetOpen(true);
    setSheetLoading(true);
    try {
      const ctx = words.slice(-30).join(" ");
      const r = await api<{ word: string; definition: string; domain: string; what_to_say: string }>(
        "/explain",
        { method: "POST", body: { word: clean, context: ctx, language: lang } }
      );
      setSel({ word: r.word, definition: r.definition, domain: r.domain, whatToSay: r.what_to_say });
      // Auto-save to library (shared with mobile)
      api("/library/save", {
        method: "POST",
        body: { word: r.word, definition: r.definition, domain: r.domain, what_to_say: r.what_to_say, language: lang },
      }).catch(() => {});
    } catch (e: any) {
      setSel({ word: clean, definition: "Errore: " + e.message, domain: "Generale", whatToSay: "" });
    } finally {
      setSheetLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="subtitles-head">
        <div>
          <h1>Sottotitoli live</h1>
          <p>Parla durante il meeting — tocca le parole per scoprirle.</p>
        </div>
      </div>

      {permissionError && (
        <div className="err" style={{ marginBottom: 16, padding: 12, background: "rgba(248,113,113,0.08)", borderRadius: 10, border: "1px solid rgba(248,113,113,0.25)" }}>
          {permissionError}
        </div>
      )}

      <div className="stream" ref={streamRef}>
        {words.length === 0 ? (
          <div className="stream-empty">
            {recording
              ? "In ascolto… parla in italiano, inglese, spagnolo, francese o tedesco."
              : "Premi il pulsante per iniziare. Le parole appariranno qui."}
          </div>
        ) : (
          <div className="words">
            {words.map((w, i) => (
              <span
                key={i}
                className="word"
                data-testid={`word-${i}`}
                onClick={() => onWordClick(w)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") onWordClick(w); }}
              >
                {w}
              </span>
            ))}
          </div>
        )}
        {sending > 0 && (
          <div className="sending"><span className="dot-pulse" /> Sto trascrivendo…</div>
        )}
      </div>

      <div className="rec-wrap">
        <div className="rec-btn-shell">
          {recording && <div className="rec-pulse-ring" />}
          <button
            data-testid="record-btn"
            className={`rec-btn ${recording ? "recording" : ""}`}
            onClick={recording ? stop : start}
            aria-label={recording ? "Ferma" : "Inizia"}
          >
            {recording ? <span className="stop-square" /> : <IMic width={48} height={48} />}
          </button>
        </div>
        <p className="rec-label">{recording ? "Tocca per fermare" : "Tocca per iniziare"}</p>
      </div>

      <WordSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        loading={sheetLoading}
        word={sel.word}
        definition={sel.definition}
        domain={sel.domain}
        whatToSay={sel.whatToSay}
      />
    </div>
  );
}
