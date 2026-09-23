// ---------------------------------------------------------------------------
// The Conversation — Reddit-driven local chatter
// ---------------------------------------------------------------------------
// Tile grid of curated discussions/news/restaurant chatter from regional subs.
// Generator guarantees every shipped post has a Recraft image — posts that
// fail image generation get swapped out for reserve candidates upstream.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import pulseData from "../../../data/south-bay/reddit-pulse.json";
import { formatAge, resolvePostAgeHours } from "../../../lib/south-bay/postAge";

interface PulsePost {
  id: string;
  sub: string;
  title: string;
  /** Light-touch grammar/punctuation/casing cleanup of `title`. Falls back to
   *  `title` if absent. UI should always render `displayTitle ?? title`. */
  displayTitle?: string;
  summary: string;
  category: string;
  topic?: string;
  image?: string | null;
  score: number;
  numComments: number;
  ageHours: number;
  createdUtc: number;
  permalink: string;
  externalUrl: string | null;
}

/**
 * Reads the clock only after mount. A static Astro build can't know the
 * visitor's current time, so computing during render would freeze the
 * build-time value into the HTML and mismatch on hydration. Same shape as
 * useLiveTodayLabel. Until then `resolvePostAgeHours` falls back to the
 * generator's stored value.
 */
function useNowMs(): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    // Tiles are minute-granular only at the low end; an hourly refresh keeps a
    // long-lived tab honest without churning the whole grid.
    const id = window.setInterval(tick, 3_600_000);
    return () => window.clearInterval(id);
  }, []);
  return nowMs;
}

// The grid is a fixed 4-column layout (2-col at mobile). Generator targets 12
// (4×3), but if it underdelivers we keep the grid clean by trimming to a
// multiple of 4 so the bottom row is never short. Mobile (2-col) is always
// happy because every multiple of 4 is also a multiple of 2.
const PULSE_TILE_COUNT = 12;
const PULSE_COLS = 4;

export default function RedditPulseTeaser() {
  const nowMs = useNowMs();

  // Defensive: drop any post without a real image. Generator guarantees images
  // upstream, but if a stale data file slips through we'd rather show fewer
  // tiles than a gradient placeholder.
  const withImages = ((pulseData?.posts ?? []) as PulsePost[]).filter((p) => !!p.image);
  const trimCount =
    withImages.length >= PULSE_TILE_COUNT
      ? PULSE_TILE_COUNT
      : Math.floor(withImages.length / PULSE_COLS) * PULSE_COLS;
  const posts = withImages.slice(0, trimCount);
  if (posts.length === 0) return null;

  return (
    <section aria-label="The Conversation" className="sbt-home-section">
      <header className="sb-section-header sbt-home-head">
        <div>
          <h2 className="sb-section-title">The Conversation</h2>
          <p className="sbt-home-dek">What people are talking about across the South Bay</p>
        </div>
      </header>

      <div className="sbt-tiles">
        {posts.map((p) => (
          <PulseTile key={p.id} post={p} nowMs={nowMs} />
        ))}
      </div>

      <p className="sbt-home-footnote">
        Tap any post to jump into the thread on Reddit
      </p>
    </section>
  );
}

/**
 * One Recraft-illustrated post tile. The <img> is server-rendered (so it
 * may finish, or fail, before hydration attaches onLoad/onError); the
 * layout effect reads img.complete to catch up. Pre-hydration it renders
 * fully visible; after mount a still-loading image fades in over the warm
 * placeholder, and a dead one leaves the placeholder (never a black box).
 */
function PulseTile({ post: p, nowMs }: { post: PulsePost; nowMs: number | null }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [phase, setPhase] = useState<"initial" | "loading" | "ready" | "error">("initial");

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) setPhase(img.naturalWidth > 0 ? "ready" : "error");
    else setPhase("loading");
  }, [p.image]);

  return (
    <a
      href={p.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={`sbt-tile sbt-ph${phase === "loading" ? " is-loading" : ""}`}
    >
      {/* Real <img> (not CSS background-image) so the browser's native
          lazy-loading actually defers offscreen tiles — a
          background-image never enters the loading="lazy" pipeline. */}
      {phase !== "error" && (
        <img
          ref={imgRef}
          className={`sbt-tile-img${phase === "loading" ? " is-pending" : ""}`}
          src={p.image ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          width={400}
          height={400}
          onLoad={() => setPhase("ready")}
          onError={() => setPhase("error")}
        />
      )}

      {/* Bottom-up gradient for legibility under title */}
      <div className="sbt-tile-shade" aria-hidden="true" />

      {/* Top metadata */}
      <div className="sbt-tile-top">
        <span className="sbt-tile-badge">r/{p.sub}</span>
      </div>

      {/* Bottom: title + footer metadata */}
      <div className="sbt-tile-bottom">
        <div className="sbt-tile-title">{p.displayTitle || p.title}</div>
        <div className="sbt-tile-meta">
          {p.score > 0 && <><span>↑ {p.score}</span><span aria-hidden="true">·</span></>}
          {p.numComments > 0 && <><span>💬 {p.numComments}</span><span aria-hidden="true">·</span></>}
          <span>{formatAge(resolvePostAgeHours(p.createdUtc, p.ageHours, nowMs))}</span>
        </div>
      </div>
    </a>
  );
}
