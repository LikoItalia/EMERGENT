import { useCallback, useEffect, useMemo, useState } from "react";
import { api, DOMAIN_COLORS, type SavedWord } from "../lib/api";
import { IArrowLeft, ISearch, ITrash } from "../components/Icons";

export function Library() {
  const [words, setWords] = useState<SavedWord[]>([]);
  const [q, setQ] = useState("");
  const [activeDomain, setActiveDomain] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ words: SavedWord[] }>("/library/words");
      setWords(r.words);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const m: Record<string, SavedWord[]> = {};
    const lower = q.toLowerCase();
    for (const w of words) {
      if (q && !w.word.includes(lower) && !w.definition.toLowerCase().includes(lower)) continue;
      (m[w.domain] = m[w.domain] || []).push(w);
    }
    return m;
  }, [words, q]);

  const domains = Object.keys(grouped).sort();
  const currentList = activeDomain ? grouped[activeDomain] || [] : [];

  const delWord = async (id: string) => {
    if (!confirm("Eliminare questa parola?")) return;
    await api(`/library/word/${id}`, { method: "DELETE" });
    load();
  };
  const delDomain = async (d: string) => {
    if (!confirm(`Svuotare il settore "${d}"?`)) return;
    await api(`/library/domain/${encodeURIComponent(d)}`, { method: "DELETE" });
    setActiveDomain(null);
    load();
  };

  return (
    <div className="container">
      <div className="library-head">
        <div className="row">
          {activeDomain && (
            <button className="back-btn" onClick={() => setActiveDomain(null)} aria-label="Indietro">
              <IArrowLeft />
            </button>
          )}
          <div>
            <h1>{activeDomain || "Libreria"}</h1>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {words.length} parole · {Object.keys(grouped).length} settori
              {" · "}
              <span style={{ color: "var(--primary)" }}>condivisa con l'app mobile</span>
            </p>
          </div>
        </div>
        <div className="search">
          <ISearch />
          <input
            data-testid="library-search"
            type="text"
            placeholder="Cerca una parola…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {!activeDomain ? (
        domains.length === 0 ? (
          <p className="empty">Le parole che cliccherai durante un meeting appariranno qui, organizzate per settore.</p>
        ) : (
          <div className="grid">
            {domains.map((d) => {
              const dc = DOMAIN_COLORS[d] || DOMAIN_COLORS.Generale;
              return (
                <div
                  key={d}
                  data-testid={`domain-${d}`}
                  className="domain-card"
                  style={{ background: dc.bg, borderColor: dc.border }}
                  onClick={() => setActiveDomain(d)}
                >
                  <div className="domain-name" style={{ color: dc.text }}>{d}</div>
                  <div className="domain-count">{grouped[d].length}</div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <>
          <button className="clear-btn" onClick={() => delDomain(activeDomain)}>
            <ITrash width={14} height={14} /> Svuota settore
          </button>
          {currentList.map((w) => {
            const dc = DOMAIN_COLORS[w.domain] || DOMAIN_COLORS.Generale;
            return (
              <div key={w.id} className="word-card">
                <div className="word-head">
                  <span className="word-term">{w.word}</span>
                  <span className="badge" style={{ background: dc.bg, borderColor: dc.border, color: dc.text }}>{w.domain}</span>
                </div>
                <p className="word-def">{w.definition}</p>
                {!!w.what_to_say && (
                  <div className="say-box">
                    <p className="say-lbl">Cosa dire</p>
                    <p className="say-text">{w.what_to_say}</p>
                  </div>
                )}
                <button className="del-btn" onClick={() => delWord(w.id)} aria-label="Elimina">
                  <ITrash />
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
