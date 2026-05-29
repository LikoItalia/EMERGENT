import { useEffect } from "react";
import { DOMAIN_COLORS } from "../lib/api";
import { IClose, IChat } from "./Icons";

type Props = {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  word: string;
  definition: string;
  domain: string;
  whatToSay: string;
};

export function WordSheet({ open, onClose, loading, word, definition, domain, whatToSay }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  const dc = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Generale;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} data-testid="word-sheet">
        <button className="sheet-close" onClick={onClose} aria-label="Chiudi">
          <IClose />
        </button>
        <div className="sheet-head">
          <h2 data-testid="sheet-word">{word}</h2>
          <span
            className="badge"
            data-testid="sheet-domain"
            style={{ background: dc.bg, borderColor: dc.border, color: dc.text }}
          >
            {domain}
          </span>
        </div>
        {loading ? (
          <p className="loading-text">Sto pensando…</p>
        ) : (
          <>
            <p className="tiny-label" style={{ marginTop: 4, marginBottom: 8 }}>Definizione</p>
            <p data-testid="sheet-def" style={{ fontSize: 17, lineHeight: 1.55, color: "var(--text)" }}>{definition}</p>
            <div className="spacer-md" />
            <p className="tiny-label" style={{ marginBottom: 8 }}>Cosa dire</p>
            <div className="say-box" style={{ marginTop: 0 }}>
              <p className="row" style={{ alignItems: "flex-start", color: "var(--text)", fontSize: 15, lineHeight: 1.55, fontStyle: "italic" }}>
                <IChat width={16} height={16} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 3 }} />
                <span data-testid="sheet-whattosay">{whatToSay}</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
