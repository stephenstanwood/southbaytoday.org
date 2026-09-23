import { useState, useRef } from "react";

interface Citation {
  city: string;
  date: string;
  meetingType: string;
  topic: string;
  title: string;
  excerpt: string;
}

interface AskResponse {
  answer: string;
  followups: string[];
  citations: Citation[];
  totalRecords: number;
}

const CITY_NAME_MAP: Record<string, string> = {
  campbell: "Campbell",
  "los-gatos": "Los Gatos",
  saratoga: "Saratoga",
  cupertino: "Cupertino",
  sunnyvale: "Sunnyvale",
  "mountain-view": "Mountain View",
  "san-jose": "San José",
  "santa-clara": "Santa Clara",
  "palo-alto": "Palo Alto",
  milpitas: "Milpitas",
  "los-altos": "Los Altos",
};

// Display in a friendly geographic-ish order so the dropdown reads naturally.
const CITY_ORDER = [
  "san-jose", "santa-clara", "sunnyvale", "mountain-view", "palo-alto",
  "los-altos", "cupertino", "campbell", "saratoga", "los-gatos", "milpitas",
];

const STARTERS: { label: string; q: string }[] = [
  { label: "What's happening with housing?",       q: "housing zoning affordable" },
  { label: "Any new parks or trails?",             q: "parks trails recreation" },
  { label: "Where's the budget going?",            q: "budget spending appropriation" },
  { label: "What road projects are approved?",     q: "traffic transportation streets" },
  { label: "Any downtown development in the works?", q: "downtown development construction" },
];

function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function abbrevType(t: string): string {
  if (/city council/i.test(t)) return "City Council";
  if (/planning/i.test(t)) return "Planning";
  if (/parks/i.test(t)) return "Parks & Rec";
  if (/transportation/i.test(t)) return "Transportation";
  if (/budget/i.test(t)) return "Budget";
  return t;
}

interface ChatTurn {
  id: string;
  question: string;
  city: string; // city id at time of question
  answer: string | null;
  followups: string[];
  citations: Citation[];
  totalRecords: number;
  error: string | null;
  showSources: boolean;
}

interface Props {
  selectedCities: Set<string>;
}

export default function MinutesSearchCard({ selectedCities }: Props) {
  // Default the picker to whichever city is most useful: if exactly one is in
  // the global filter, use it; otherwise leave empty so the user must choose.
  const initialCity = (() => {
    const ids = [...selectedCities].filter((id) => id in CITY_NAME_MAP);
    if (ids.length === 1) return ids[0];
    return "";
  })();

  const [city, setCity] = useState<string>(initialCity);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const cityName = city ? CITY_NAME_MAP[city] : "";
  const canSubmit = !!city && query.trim().length >= 2 && !loading;

  const ask = async (display: string, searchQuery: string) => {
    if (!city) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const turn: ChatTurn = {
      id,
      question: display,
      city,
      answer: null,
      followups: [],
      citations: [],
      totalRecords: 0,
      error: null,
      showSources: false,
    };
    setHistory((h) => [...h, turn]);
    setLoading(true);
    setQuery("");

    try {
      const res = await fetch("/api/south-bay/ask-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, query: searchQuery }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data: AskResponse = await res.json();
      setHistory((h) => {
        return h.map((t) => t.id === id ? {
          ...t,
          answer: data.answer,
          followups: data.followups ?? [],
          citations: data.citations ?? [],
          totalRecords: data.totalRecords ?? 0,
          showSources: (data.citations ?? []).length > 0,
        } : t);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setHistory((h) => {
        return h.map((t) => t.id === id ? { ...t, error: msg } : t);
      });
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    const q = query.trim();
    ask(q, q);
  };

  const handleStarter = (s: { label: string; q: string }) => {
    if (!city) {
      inputRef.current?.focus();
      return;
    }
    ask(s.label, s.q);
  };

  // Toggle the "show sources" panel for a given turn.
  const toggleSources = (i: number) => {
    setHistory((h) => h.map((t, j) => (j === i ? { ...t, showSources: !t.showSources } : t)));
  };

  // Reset chat when city changes — keeps the model from confusing scopes.
  const onCityChange = (newCity: string) => {
    setCity(newCity);
    setHistory([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const hasHistory = history.length > 0;

  return (
    <section className="gov-section gov-ask" aria-labelledby="gov-ask-title">
      <div className="sb-section-header gov-section-head gov-section-head--flush">
        <h2 id="gov-ask-title" className="sb-section-title">Ask the Records</h2>
      </div>

      <div className="gov-ask-card">
        {/* City picker — always visible at the top of the card */}
        <div className="gov-ask-bar">
          <label className="gov-ask-label" htmlFor="gov-ask-city">City</label>
          <div className={`gov-ask-select${city ? " is-set" : ""}`}>
            <select
              id="gov-ask-city"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
            >
              <option value="">Pick a city…</option>
              {CITY_ORDER.map((id) => (
                <option key={id} value={id}>{CITY_NAME_MAP[id]}</option>
              ))}
            </select>
            <span className="gov-ask-caret" aria-hidden="true" />
          </div>
          {!city && (
            <span className="gov-ask-hint">← pick one to start</span>
          )}
          {city && hasHistory && (
            <button
              type="button"
              className="sb-btn sb-btn--quiet gov-ask-clear"
              onClick={() => { setHistory([]); inputRef.current?.focus(); }}
            >
              Clear chat
            </button>
          )}
        </div>

        {/* Messages area */}
        <div className="gov-ask-log">
          {/* Greeting — shown until the first question lands */}
          {!hasHistory && !loading && (
            <BotBubble>
              {city ? (
                <>
                  Hi! I&apos;ve read every recent <strong>{cityName}</strong> council meeting,
                  agenda, and transcript so you don&apos;t have to. Ask about budget moves,
                  housing votes, what&apos;s getting built, or who showed up for public comment.
                  I&apos;ll answer in plain English and show the records I&apos;m pulling from.
                </>
              ) : (
                <>
                  Hi! 👋 I dig through council meetings, agendas, and transcripts for the
                  South Bay&apos;s 11 cities and answer in plain English. Pick a city up top,
                  then ask me anything: budgets, housing, parks, who voted how, what&apos;s
                  being built.
                </>
              )}
            </BotBubble>
          )}

          {/* Starter chips (always under greeting before first ask) */}
          {!hasHistory && !loading && (
            <div className="gov-ask-starters">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="gov-pill"
                  onClick={() => handleStarter(s)}
                  disabled={!city}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Chat history */}
          {history.map((turn, i) => (
            <div key={i} className="gov-ask-turn">
              {/* User bubble */}
              <div className="gov-ask-user">
                <p>{turn.question}</p>
              </div>

              {/* Bot response */}
              <BotBubble>
                {turn.error ? (
                  <span className="gov-ask-error">{turn.error}</span>
                ) : turn.answer === null ? (
                  <span className="gov-ask-status">
                    <span className="sb-spinner gov-ask-spinner" aria-hidden="true" />
                    Reading {CITY_NAME_MAP[turn.city]} meetings…
                  </span>
                ) : (
                  <>
                    <div className="gov-ask-answer">{turn.answer}</div>

                    {turn.citations.length > 0 && (
                      <div className="gov-ask-sources-bar">
                        <button
                          type="button"
                          className="gov-pill gov-pill--sm"
                          aria-expanded={turn.showSources}
                          onClick={() => toggleSources(i)}
                        >
                          {turn.showSources ? "▴ Hide sources" : `▾ ${turn.totalRecords > turn.citations.length ? `Top ${turn.citations.length} of ${turn.totalRecords}` : `${turn.citations.length}`} source${turn.citations.length === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    )}

                    {turn.showSources && turn.citations.length > 0 && (
                      <div className="gov-ask-sources">
                        {turn.citations.map((c, j) => (
                          <SourceRow key={j} citation={c} />
                        ))}
                      </div>
                    )}

                    {turn.followups.length > 0 && i === history.length - 1 && !loading && (
                      <div className="gov-ask-next">
                        <div className="sb-eyebrow">Try next</div>
                        {turn.followups.map((f) => (
                          <button
                            key={f}
                            type="button"
                            className="gov-pill"
                            onClick={() => ask(f, f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </BotBubble>
            </div>
          ))}

          {/* Loading shimmer (only if no in-flight turn already shows it) */}
          {loading && history[history.length - 1]?.answer !== null && (
            <BotBubble>
              <span className="gov-ask-status">
                <span className="sb-spinner gov-ask-spinner" aria-hidden="true" />
                Reading {cityName} meetings…
              </span>
            </BotBubble>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="gov-ask-form">
          <input
            ref={inputRef}
            type="text"
            className="gov-ask-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={city ? `Ask about ${cityName}…` : "Pick a city first ↑"}
            aria-label={city ? `Ask about ${cityName} council records` : "Ask the records (pick a city first)"}
            disabled={!city || loading}
          />
          <button
            type="submit"
            className="gov-ask-send"
            disabled={!canSubmit}
            aria-label="Send"
          >
            ↑
          </button>
        </form>
      </div>

      <p className="gov-ask-note">
        Answers come from real council records via{" "}
        <a href="https://stoa.works" target="_blank" rel="noopener noreferrer">Stoa</a>.
        Always double-check before quoting.
      </p>
    </section>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="gov-ask-msg">
      <div className="gov-ask-avatar" aria-hidden="true">🏛️</div>
      <div className="gov-ask-bubble">{children}</div>
    </div>
  );
}

function SourceRow({ citation }: { citation: Citation }) {
  return (
    <div className="gov-ask-source">
      <div className="gov-ask-source-meta">
        <span className="gov-ask-source-city">{citation.city}</span>
        <span className="gov-ask-source-date">{formatDate(citation.date)}</span>
        <span className="gov-ask-source-sep" aria-hidden="true">·</span>
        <span>{abbrevType(citation.meetingType)}</span>
        {citation.topic && citation.topic !== "General" && (
          <>
            <span className="gov-ask-source-sep" aria-hidden="true">·</span>
            <span className="gov-ask-source-topic">{citation.topic}</span>
          </>
        )}
      </div>
      {citation.excerpt && (
        <>
          {citation.title && (
            <div className="gov-ask-source-title">{citation.title}</div>
          )}
          <div className="gov-ask-source-excerpt">{citation.excerpt}</div>
        </>
      )}
    </div>
  );
}
