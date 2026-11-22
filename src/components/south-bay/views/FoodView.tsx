import { useEffect, useRef, useState } from "react";
import sccFoodOpeningsJson from "../../../data/south-bay/scc-food-openings.json";
import restaurantRadarJson from "../../../data/south-bay/restaurant-radar.json";
import { farmersMarketsForWeek } from "../../../data/south-bay/events-data";
import PageHero from "../PageHero";

const DAY_LABEL  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const PT_ZONE = "America/Los_Angeles";

// Inline meta separator. The NBSP glues the dot to the word before it, so a
// wrapped line never begins with "·".
const SEP = "\u00a0· ";

const CITY_DISPLAY: Record<string, string> = {
  "san-jose": "San José",
  "mountain-view": "Mountain View",
  "sunnyvale": "Sunnyvale",
  "santa-clara": "Santa Clara",
  "cupertino": "Cupertino",
  "milpitas": "Milpitas",
  "campbell": "Campbell",
  "saratoga": "Saratoga",
  "los-gatos": "Los Gatos",
  "los-altos": "Los Altos",
  "palo-alto": "Palo Alto",
};

function cityFor(cityId: string | null | undefined, fallback?: string): string {
  if (cityId && CITY_DISPLAY[cityId]) return CITY_DISPLAY[cityId];
  if (fallback) {
    return fallback.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "";
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Data snapshots carry a UTC timestamp, and the nightly run lands after 5 PM
// Pacific, so slicing the ISO date said "Updated Sep 23" on the evening of
// Sep 22. Show the Pacific date instead. A fixed instant in a fixed zone, so
// the prerendered HTML and the hydrating client always agree.
function formatUpdated(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { timeZone: PT_ZONE, month: "short", day: "numeric" });
}

// When each data file was generated. Until mount, the tab measures "today"
// and the permit window from these instead of the clock (see useMountedNow).
const OPENINGS_SNAPSHOT_MS = Date.parse((sccFoodOpeningsJson as { generatedAt: string }).generatedAt) || 0;
const RADAR_SNAPSHOT_MS = Date.parse((restaurantRadarJson as { generatedAt: string }).generatedAt);

/**
 * The viewer's clock, read only after mount. The Food tab is prerendered at
 * build time and hydrated later, so reading the clock during render would bake
 * the build's day into the HTML and mismatch on hydration. Null until mounted;
 * callers fall back to their data snapshot's own timestamp.
 */
function useMountedNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}

// ── Openings, inspections, and coming soon ─────────────────────────────────

type FoodItem = {
  id: string;
  name: string;
  address: string | null;
  cityId: string | null;
  cityName: string;
  date?: string | null;
  inspectionDate?: string | null;
  status: "opened" | "inspection-complete" | "coming-soon";
  blurb?: string | null;
  photoRef?: string | null;
  image?: string | null;
};

type Tone = "open" | "inspection" | "soon";

const STATUS_LABEL: Record<Tone, string> = {
  open: "Opened",
  inspection: "Inspected",
  soon: "Coming soon",
};

// idle: server render / pre-hydration (the <img> paints as it normally would).
// loading: mounted, photo still on its way (placeholder shimmers, img hidden).
// ready: photo painted (fades in). failed: no usable photo (monogram tile).
type PhotoState = "idle" | "loading" | "ready" | "failed";

function monogramFor(name: string): string {
  const letter = name.match(/[A-Za-z0-9]/);
  return letter ? letter[0].toUpperCase() : "";
}

// A county filing usually names no cuisine, so the generator's honest
// fallback is a location-only line ("Food business on Lotus Street in San
// Jose."). The tile already prints the city and street, so keep only the
// business type the line names, and drop it when that is just "Food business".
function tileBlurb(blurb: string | null | undefined): string | null {
  const text = blurb?.trim();
  if (!text) return null;
  const located = /^(.{2,48}?)\s+(?:planned\s+)?(?:on|at)\s+[^.]+?\s+in\s+[A-Z][\w .'-]*\.?$/.exec(text);
  if (!located) return text;
  const kind = located[1].trim();
  return /^food (?:business|spot|venue)$/i.test(kind) ? null : kind;
}

function FoodTile({ item }: { item: FoodItem }) {
  const isOpen = item.status === "opened";
  const isInspection = item.status === "inspection-complete";
  const tone: Tone = isOpen ? "open" : isInspection ? "inspection" : "soon";
  // Tier 1: real Google Places photo. Tier 2: Recraft food illustration.
  // Tier 3: status-toned placeholder with the name's initial.
  const primary = item.photoRef
    ? `/api/place-photo?ref=${encodeURIComponent(item.photoRef)}&w=480&h=480`
    : item.image
      ? item.image
      : null;
  const fallback = item.photoRef && item.image ? item.image : null;
  const [src, setSrc] = useState<string | null>(primary);
  const [photo, setPhoto] = useState<PhotoState>(primary ? "idle" : "failed");
  const imgRef = useRef<HTMLImageElement>(null);

  const fail = () => {
    if (fallback && src !== fallback) {
      setSrc(fallback);
      setPhoto("loading");
      return;
    }
    setPhoto("failed");
  };

  // A photo can settle (load or 404) before hydration attaches onLoad/onError,
  // so check once on mount rather than waiting for events that already fired.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      if (img.naturalWidth > 0) setPhoto("ready");
      else fail();
    } else {
      setPhoto((state) => (state === "idle" ? "loading" : state));
    }
    // Mount-only: `fail` reads the initial src, which is what the check needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const city = cityFor(item.cityId, item.cityName);
  const mapsQuery = encodeURIComponent(
    [item.name, item.address, city].filter(Boolean).join(" "),
  );
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const dateLabel = formatShortDate(isInspection ? item.inspectionDate ?? null : item.date ?? null);
  const blurb = tileBlurb(item.blurb);

  return (
    <a
      href={mapsHref}
      target="_blank"
      rel="noopener noreferrer"
      className={`food-tile food-tone--${tone}`}
      data-photo={photo}
    >
      <span className="food-tile-ph" aria-hidden="true">
        <span className="food-tile-mono">{monogramFor(item.name)}</span>
      </span>
      {src && photo !== "failed" && (
        <img
          ref={imgRef}
          className="food-tile-img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setPhoto("ready")}
          onError={fail}
        />
      )}
      <span className="food-tile-scrim" aria-hidden="true" />
      <span className="food-tile-badge">{STATUS_LABEL[tone]}</span>
      <span className="food-tile-body">
        {city && <span className="food-tile-city">{city}</span>}
        <span className="food-tile-name">{item.name}</span>
        {blurb && <span className="food-tile-blurb">{blurb}</span>}
        {item.address && <span className="food-tile-addr">{item.address}</span>}
        {dateLabel && (
          <span className="food-tile-date">
            {isOpen ? `Opened ${dateLabel}` : isInspection ? `Final inspection ${dateLabel}` : `Permit ${dateLabel}`}
          </span>
        )}
      </span>
    </a>
  );
}

function NewAndComingSoon() {
  const data = sccFoodOpeningsJson as {
    generatedAt: string;
    opened: FoodItem[];
    inspections: FoodItem[];
    comingSoon: FoodItem[];
  };
  const openedAll = (data.opened ?? []).filter((i) => i.name && i.cityId);
  const inspectionsAll = (data.inspections ?? []).filter((i) => i.name && i.cityId);
  const comingSoonAll = (data.comingSoon ?? []).filter((i) => i.name && i.cityId);
  const opened = openedAll.slice(0, 8);
  const inspections = inspectionsAll.slice(0, 8);
  const comingSoon = comingSoonAll.slice(0, 8);
  if (opened.length === 0 && inspections.length === 0 && comingSoon.length === 0) return null;

  const updated = formatUpdated(data.generatedAt);

  return (
    <section className="food-section" aria-labelledby="food-openings-title">
      <header className="food-section-head">
        <h2 className="food-h2" id="food-openings-title">Food Openings &amp; Permits</h2>
        <p className="food-sub">
          Verified openings, final inspections + permits
          {updated && <>{SEP}Updated {updated}</>}
          {SEP}<a className="food-sub-link" href="/food/new">Full list</a>
        </p>
      </header>

      {opened.length > 0 && (
        <div className="food-group food-tone--open">
          <h3 className="food-group-label">Verified Openings</h3>
          <div className="food-tile-grid">
            {opened.map((item) => <FoodTile key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {inspections.length > 0 && (
        <div className="food-group food-tone--inspection">
          <h3 className="food-group-label">Recent Final Inspections</h3>
          <div className="food-tile-grid">
            {inspections.map((item) => <FoodTile key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {comingSoon.length > 0 && (
        <div className="food-group food-tone--soon">
          <h3 className="food-group-label">Coming Soon</h3>
          <div className="food-tile-grid">
            {comingSoon.map((item) => <FoodTile key={item.id} item={item} />)}
          </div>
        </div>
      )}

      <p className="food-note">
        Sourced from Santa Clara County health-permit records{SEP}Tap a tile to find it on Google Maps
      </p>
    </section>
  );
}

// ── Permit Pulse ─────────────────────────────────────────────────────────────

type RadarSignal = "closing" | "opening" | "activity";

type RadarItem = {
  id: string;
  city: string;
  address: string;
  name: string | null;
  description?: string;
  workType?: string;
  signal: RadarSignal;
  label: string;
  valuation?: number;
  date: string;
  blurb?: string | null;
};

function formatValuation(v: number | undefined): string | null {
  if (!v || v < 50_000) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M build`;
  return `$${Math.round(v / 1000)}K build`;
}

function PermitPulseRow({ item }: { item: RadarItem }) {
  const isClose = item.signal === "closing";
  const city = cityFor(item.city);
  const dateLabel = formatShortDate(item.date);
  const valLabel = formatValuation(item.valuation);
  const mapsQuery = encodeURIComponent(
    [item.name, item.address, city].filter(Boolean).join(" "),
  );
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const icon = isClose ? "⚠" : item.signal === "opening" ? "✦" : "•";

  return (
    <a
      href={mapsHref}
      target="_blank"
      rel="noopener noreferrer"
      className={`food-pulse-row food-pulse-row--${item.signal}`}
    >
      <span className="food-pulse-icon" aria-hidden="true">{icon}</span>
      <span className="food-pulse-body">
        <span className="food-pulse-head">
          <span className="food-pulse-name">{item.name ?? "Unnamed permit"}</span>
          <span className="food-pulse-tag">{item.label}</span>
        </span>
        {item.blurb && <span className="food-pulse-blurb">{item.blurb}</span>}
        {/* Each " ·" is bound to the word before it (NBSP), so a wrapped
            line never starts with a separator. */}
        <span className="food-pulse-meta">
          {item.address}{SEP}{city}
          {valLabel && <>{SEP}<span className="food-pulse-val">{valLabel}</span></>}
          {dateLabel && <>{SEP}<span className="food-pulse-date">Permit {dateLabel}</span></>}
        </span>
      </span>
      <span className="food-pulse-go" aria-hidden="true">↗</span>
    </a>
  );
}

function PermitPulse() {
  const nowMs = useMountedNow();
  const data = restaurantRadarJson as {
    generatedAt: string;
    windowDays?: number;
    items: RadarItem[];
  };
  // De-dupe against scc-food-openings (already shown above) by lowercase name.
  const sccData = sccFoodOpeningsJson as {
    opened: Array<{ name?: string }>;
    inspections: Array<{ name?: string }>;
    comingSoon: Array<{ name?: string }>;
  };
  const sccNames = new Set<string>([
    ...(sccData.opened ?? []).map((i) => (i.name ?? "").trim().toLowerCase()).filter(Boolean),
    ...(sccData.inspections ?? []).map((i) => (i.name ?? "").trim().toLowerCase()).filter(Boolean),
    ...(sccData.comingSoon ?? []).map((i) => (i.name ?? "").trim().toLowerCase()).filter(Boolean),
  ]);

  // Render-time staleness guard: if the regen falls behind, drop items older
  // than the source's stated window so a Feb permit doesn't linger into May.
  // Measured from the viewer's clock once mounted; the prerendered first pass
  // measures from the snapshot itself so server and client HTML agree.
  const windowDays = data.windowDays ?? 60;
  const refMs = nowMs ?? RADAR_SNAPSHOT_MS;
  const cutoffMs = Number.isFinite(refMs) ? refMs - windowDays * 86400_000 : -Infinity;

  const items = (data.items ?? [])
    .filter((it) => it.name)
    .filter((it) => !sccNames.has(it.name!.trim().toLowerCase()))
    .filter((it) => {
      if (!it.date) return true;
      const t = new Date(it.date + "T12:00:00").getTime();
      return Number.isFinite(t) && t >= cutoffMs;
    });

  if (items.length === 0) return null;

  // Closures first, then openings, then activity. Within each, recent first.
  const order: Record<RadarSignal, number> = { closing: 0, opening: 1, activity: 2 };
  items.sort((a, b) => {
    const oa = order[a.signal] ?? 3;
    const ob = order[b.signal] ?? 3;
    if (oa !== ob) return oa - ob;
    return b.date.localeCompare(a.date);
  });
  const visibleItems = items.slice(0, 8);

  const updated = formatUpdated(data.generatedAt);

  return (
    <section className="food-section" aria-labelledby="food-signals-title">
      <header className="food-section-head">
        <h2 className="food-h2" id="food-signals-title">Opening Signals</h2>
        <p className="food-sub">
          Building-permit hints before they turn into public opening records
          {updated && <>{SEP}Updated {updated}</>}
        </p>
      </header>
      <div className="food-pulse-list">
        {visibleItems.map((item) => <PermitPulseRow key={item.id} item={item} />)}
      </div>
      <p className="food-note">
        Sourced from San José building permits{SEP}Tap a row to find it on Google Maps
      </p>
    </section>
  );
}

// ── Farmers Markets ─────────────────────────────────────────────────────────

function FarmersMarkets() {
  const nowMs = useMountedNow();
  // Use the same Pacific date on the server and during hydration, then switch
  // to the reader's Pacific date on mount.
  const today = new Date(nowMs ?? OPENINGS_SNAPSHOT_MS).toLocaleDateString("en-CA", { timeZone: PT_ZONE });
  const visibleDays = farmersMarketsForWeek(today);
  if (visibleDays.length === 0) return null;

  return (
    <section className="food-section" aria-labelledby="food-markets-title">
      <header className="food-section-head">
        <h2 className="food-h2" id="food-markets-title">Farmers Markets</h2>
        <p className="food-sub">
          Weekly schedule across the South Bay, ordered from today onward
        </p>
      </header>

      <div className="food-market-week">
        {visibleDays.map(({ date, weekday, markets }) => {
          const isToday = date === today;
          const label = isToday ? "Today" : DAY_LABEL[weekday];
          return (
            <div key={date} className={`food-market-day${isToday ? " is-today" : ""}`}>
              <div className="food-market-day-head"><span>{label}</span></div>
              <div className="food-market-items">
                {markets.map((m) => {
                  const inner = (
                    <>
                      <span className="food-market-emoji" aria-hidden="true">{m.emoji ?? "🥕"}</span>
                      <span className="food-market-body">
                        <span className="food-market-name">{m.title}</span>
                        <span className="food-market-meta">
                          {m.venue}{SEP}{cityFor(m.city)}
                          {m.time && <>{SEP}<span className="food-market-time">{m.time}</span></>}
                        </span>
                      </span>
                    </>
                  );
                  return m.url ? (
                    <a
                      key={m.id}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="food-market-row"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={m.id} className="food-market-row">{inner}</div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

function FoodHero() {
  return (
    <PageHero
      eyebrow="South Bay / Food Desk"
      title="Food"
      description="Verified openings, recent final inspections, promising buildouts, and farmers markets across the South Bay."
      // --sb-coral (#F43F7C) is only ~3.4:1 on the hero background as text,
      // so the kicker uses a deeper shade of the same coral (#B8235E, ~5.8:1)
      // rather than a true red.
      accent="#B8235E"
    />
  );
}

export default function FoodView() {
  return (
    <div className="food-view">
      <FoodHero />
      <NewAndComingSoon />
      <PermitPulse />
      <FarmersMarkets />
    </div>
  );
}
