// ---------------------------------------------------------------------------
// Weekend Ahead — surfaces curated weekend picks on the homepage
// ---------------------------------------------------------------------------
// The weekend-picks generator produces exactly 2 Sat + 2 Sun AI-curated
// picks, but they only appear in the Events tab strip on Fri-Sun. That's
// four weekdays of curated content sitting idle while residents are most
// likely planning. This card surfaces them on the homepage Mon → Fri as a
// 4-tile grid; if the generator couldn't deliver the 2+2 shape, we hide
// the section entirely rather than show a lopsided row.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import weekendPicksJson from "../../../data/south-bay/weekend-picks.json";

const CITY_LABELS: Record<string, string> = {
  "san-jose": "San José",
  "campbell": "Campbell",
  "los-gatos": "Los Gatos",
  "saratoga": "Saratoga",
  "cupertino": "Cupertino",
  "santa-clara": "Santa Clara",
  "sunnyvale": "Sunnyvale",
  "mountain-view": "Mountain View",
  "palo-alto": "Palo Alto",
  "milpitas": "Milpitas",
  "los-altos": "Los Altos",
};

interface WeekendPick {
  id: string;
  title: string;
  date: string;
  displayDate: string;
  time: string | null;
  endTime?: string | null;
  city: string;
  venue: string;
  cost: string | null;
  url: string;
  category: string;
  why: string;
  photoRef?: string | null;
  image?: string | null;
}

function todayPT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function pickPhoto(p: WeekendPick): string | null {
  if (p.image) return p.image;
  if (p.photoRef) return `/api/place-photo?ref=${encodeURIComponent(p.photoRef)}&w=320&h=320`;
  return null;
}

function timeToMinutes(t: string | null | undefined): number {
  if (!t) return 24 * 60;
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 24 * 60;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

// The square tile crops photography with `cover`, which is the right call
// for real venue photos — but a source-supplied `image` (poster/banner art
// from the event listing itself, as opposed to a curated Google Places
// venue photo) is disproportionately likely to carry embedded headline
// text that a blind center-crop slices off. Only `image`-sourced tiles are
// considered flyer candidates; `photoRef` always resolves to photography
// and stays on `cover`. Within candidates, only genuinely non-square
// aspect ratios (portrait posters, or wide text banners) flip to `contain`.
// The ratio is read from the tile's own <img> when it loads (it stays
// hidden until then), so a flyer never flashes cropped first.
function flyerFit(img: HTMLImageElement): "cover" | "contain" {
  if (!img.naturalWidth || !img.naturalHeight) return "cover";
  const ratio = img.naturalWidth / img.naturalHeight;
  return ratio < 0.85 || ratio > 2 ? "contain" : "cover";
}

export default function WeekendAheadCard({ onNavigate }: { onNavigate: (tab: "events") => void }) {
  const data = weekendPicksJson as {
    generatedAt?: string;
    weekendStart: string;
    weekendEnd: string;
    weekendLabel: string;
    picks: WeekendPick[];
  };

  // Everything below keys off "today" (weekday gate, staleness, Today/
  // Tomorrow badges), so the whole card waits for mount: the server render
  // can't know the visitor's date, and any clock read here would mismatch
  // the build-time HTML. SSR/first paint render nothing; the card appears
  // right after hydration. It sits below the fold, so no visible jank.
  const [todayIso, setTodayIso] = useState<string | null>(null);
  useEffect(() => { setTodayIso(todayPT()); }, []);
  if (!todayIso) return null;

  const todayDow = new Date(todayIso + "T12:00:00").getDay();

  // Hide on Sat/Sun — by then weekend events should be flowing into the
  // bucket grid plans, and a "Weekend Ahead" tease has nothing to add.
  if (todayDow === 6 || todayDow === 0) return null;

  // Staleness guard — if the generator hasn't run in over a week, hide.
  if (data.generatedAt) {
    const ageDays = (Date.now() - new Date(data.generatedAt).getTime()) / 86_400_000;
    if (ageDays > 8) return null;
  }

  // Require exactly 2 Sat + 2 Sun — the generator is structured to deliver
  // that shape, and the 4-up grid layout reads broken at any other count.
  // Final display re-sorts chronologically so tiles read left-to-right by time.
  const upcoming = data.picks.filter((p) => p.date >= todayIso);
  const sats = upcoming.filter((p) => new Date(p.date + "T12:00:00").getDay() === 6).slice(0, 2);
  const suns = upcoming.filter((p) => new Date(p.date + "T12:00:00").getDay() === 0).slice(0, 2);
  if (sats.length < 2 || suns.length < 2) return null;
  const visible = [...sats, ...suns].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });

  const heading = "The Weekend Ahead";

  return (
    <section aria-label="Weekend ahead" className="sbt-home-section">
      <header className="sb-section-header sbt-home-head">
        <div>
          <h2 className="sb-section-title">{heading}</h2>
          <p className="sbt-home-dek">Four picks for Saturday and Sunday.</p>
        </div>
        <button type="button" className="sb-btn" onClick={() => onNavigate("events")}>
          All events →
        </button>
      </header>

      <div className="sbt-tiles">
        {visible.map((p) => {
          const cityName = CITY_LABELS[p.city] ?? p.city;
          const dayBadge =
            p.date === todayIso
              ? "Today"
              : p.date === addDays(todayIso, 1)
                ? "Tomorrow"
                : new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
          return <WeekendTile key={p.id} pick={p} dayBadge={dayBadge} cityName={cityName} />;
        })}
      </div>
    </section>
  );
}

function WeekendTile({
  pick: p,
  dayBadge,
  cityName,
}: {
  pick: WeekendPick;
  dayBadge: string;
  cityName: string;
}) {
  const photo = pickPhoto(p);
  const isFlyerCandidate = Boolean(p.image);
  const [state, setState] = useState<"loading" | "ready" | "error">(photo ? "loading" : "error");
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const isFlyer = state === "ready" && fit === "contain";

  const classes = ["sbt-tile", "sbt-ph"];
  if (state === "loading") classes.push("is-loading");
  if (state === "error") classes.push("is-fallback");
  if (isFlyer) classes.push("is-flyer");

  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className={classes.join(" ")}
      title={p.why}
    >
      {isFlyer && photo && (
        <div className="sbt-tile-backdrop" style={{ backgroundImage: `url(${photo})` }} aria-hidden="true" />
      )}
      {photo && state !== "error" && (
        <img
          className={`sbt-tile-img${state === "ready" ? "" : " is-pending"}`}
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          width={320}
          height={320}
          onLoad={(e) => {
            if (isFlyerCandidate) setFit(flyerFit(e.currentTarget));
            setState("ready");
          }}
          onError={() => setState("error")}
        />
      )}
      <div className="sbt-tile-shade" aria-hidden="true" />
      <div className="sbt-tile-top">
        <span className="sbt-tile-badge sbt-tile-badge--day">{dayBadge}</span>
      </div>
      <div className="sbt-tile-bottom">
        <div className="sbt-tile-title">{p.title}</div>
        <div className="sbt-tile-meta sbt-tile-meta--stack">
          <span>{cityName}</span>
          {p.time && (
            <>
              <span className="sbt-tile-sep" aria-hidden="true">·</span>
              <span>{p.time}</span>
            </>
          )}
        </div>
      </div>
    </a>
  );
}
