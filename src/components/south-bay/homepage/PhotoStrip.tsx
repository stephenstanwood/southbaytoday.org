// ---------------------------------------------------------------------------
// Photo strip — auto-scrolling marquee of curated South Bay photos
// ---------------------------------------------------------------------------
// Styles live in src/styles/sbt/home.css (loaded site-wide from BaseLayout,
// so /city/<slug> pages get them too).
//
// Loading: the loop is 20 photos (~40-170 KB each) rendered twice. Fetching
// all of them eagerly made the page's `load` event wait on ~1.3 MB of
// third-party images (Flickr / Wikimedia / iNaturalist); on a slow or
// contended connection `load` never fired inside 30 s. Now only the tiles
// on screen at mount, plus whatever the marquee will reveal in the next
// few seconds, load right away (3-4 tiles); the rest are released just
// ahead of the marquee as it moves, and all at once after `load` fires.
// The duplicate copy reuses the same URLs (browser cache).
// ---------------------------------------------------------------------------

import { memo, useState, useEffect, useMemo, useRef } from "react";
import curatedPhotosJson from "../../../data/south-bay/curated-photos.json";

type CuratedPhoto = {
  id: string; thumb: string; full: string;
  title: string; photographer: string; photoPage: string;
  license: string; source: string; city?: string;
};

const ALL_PHOTOS = (curatedPhotosJson as unknown as { photos: CuratedPhoto[] }).photos ?? [];

// Below this, a city's tagged pool can't fill a seamless 20-tile loop (and
// reads thin even duplicated) — fall back to the full South Bay pool instead
// of a same-6-photos-on-repeat marquee.
const MIN_CITY_POOL = 6;
const STRIP_SIZE = 20;
// Must match the animation duration of .sbt-strip-track in home.css.
const LOOP_SECONDS = 90;
// Tile width + margin-right (desktop). Only a fallback — the real pitch is
// measured from the first tile after mount.
const TILE_PITCH_FALLBACK = 286;
// Server render / pre-mount placeholder tiles (enough to fill 800px).
const PLACEHOLDER_TILES = 4;

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    s = (s ^ (s >>> 14)) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Props = {
  // City slug to scope the marquee to (e.g. a Campbell page shouldn't show a
  // Stanford hillside). Omitted → full South Bay pool, unchanged Home behavior.
  cityFilter?: string;
};

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export default memo(function PhotoStrip({ cityFilter }: Props) {
  // Server render and first client render show a fixed-height placeholder;
  // the strip itself mounts once, post-hydration, with its per-visit random
  // order. Rendering real photos with a build-time seed first and reshuffling
  // after mount swaps ~17 of 20 tiles mid-animation (the pool is ~139) —
  // every thumb fetched twice and the marquee stutters through hydration.
  const [seed, setSeed] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  // How many tiles (by loop index) have their <img> released so far.
  const [revealed, setRevealed] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSeed(Math.floor(Math.random() * 1_000_000)); }, []);

  // A tagged-but-thin city pool can't fill a seamless loop, so fall back to
  // the full pool rather than repeat the same handful of tiles.
  const pool = useMemo(() => {
    const cityPool = cityFilter ? ALL_PHOTOS.filter((p) => p.city === cityFilter) : ALL_PHOTOS;
    return cityPool.length >= MIN_CITY_POOL ? cityPool : ALL_PHOTOS;
  }, [cityFilter]);
  const strip = useMemo(
    () => (seed === null ? [] : seededShuffle(pool, seed).slice(0, Math.min(STRIP_SIZE, pool.length))),
    [pool, seed],
  );
  const count = strip.length;

  // Release tile images just ahead of the marquee, then everything once the
  // page has finished loading. The track moves one tile pitch every
  // LOOP_SECONDS / count seconds, so at time t the last tile that is on
  // screen (or will be within LOOKAHEAD seconds) is
  // floor((t + LOOKAHEAD) / secondsPerTile + frameWidth / pitch).
  useEffect(() => {
    if (count === 0) return;
    const LOOKAHEAD_S = 3;
    const win = window as IdleWindow;
    const frame = frameRef.current;
    const firstTile = frame?.querySelector<HTMLElement>(".sbt-strip-tile");
    const pitch = firstTile
      ? firstTile.offsetWidth + (parseFloat(getComputedStyle(firstTile).marginRight) || 0)
      : TILE_PITCH_FALLBACK;
    const tilesAcross = (frame?.clientWidth || 800) / Math.max(pitch, 1);
    const secondsPerTile = LOOP_SECONDS / count;
    const started = performance.now();

    let interval = 0;
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      const lastIndex = Math.floor((elapsed + LOOKAHEAD_S) / secondsPerTile + tilesAcross);
      const need = Math.min(count, lastIndex + 1);
      setRevealed((r) => (need > r ? need : r));
      if (need >= count) window.clearInterval(interval);
    };
    tick();
    interval = window.setInterval(tick, 1000);

    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const revealAll = () => {
      window.clearInterval(interval);
      setRevealed(count);
    };
    const onLoad = () => {
      if (win.requestIdleCallback) idleId = win.requestIdleCallback(revealAll, { timeout: 2000 });
      else timeoutId = window.setTimeout(revealAll, 300);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("load", onLoad);
      if (idleId !== null) win.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [count]);

  if (pool.length < 4) return null;

  if (seed === null) {
    return (
      <div className="sbt-strip" ref={frameRef}>
        <div className="sbt-strip-viewport">
          <div className="sbt-strip-track sbt-strip-track--static" aria-hidden="true">
            {Array.from({ length: PLACEHOLDER_TILES }, (_, i) => (
              <span key={i} className="sbt-strip-tile sbt-ph is-loading" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sbt-strip" ref={frameRef}>
      <div className="sbt-strip-viewport">
        <div className={`sbt-strip-track${paused ? " is-paused" : ""}`}>
          {strip.map((p, i) => (
            <StripTile key={p.id + "-a"} photo={p} load={i < revealed} duplicate={false} />
          ))}
          {/* Second copy exists only so translateX(-50%) wraps seamlessly;
              hidden from keyboard/AT users so they meet each photo once. */}
          {strip.map((p, i) => (
            <StripTile key={p.id + "-b"} photo={p} load={i < revealed} duplicate />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="sbt-strip-pause"
        onClick={() => setPaused((v) => !v)}
        aria-pressed={paused}
        aria-label={paused ? "Play photo scroll" : "Pause photo scroll"}
      >
        {paused ? "▶" : "❚❚"}
      </button>
    </div>
  );
});

const StripTile = memo(function StripTile({
  photo: p,
  load,
  duplicate,
}: {
  photo: CuratedPhoto;
  load: boolean;
  duplicate: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const credit = `${p.photographer ? `${p.photographer} · ` : ""}${p.license}`;
  // Shimmer only while a fetch is actually in flight; tiles still waiting
  // for their turn sit on the static warm wash.
  const shimmer = load && state === "loading";
  return (
    <a
      href={p.photoPage}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={duplicate ? undefined : `${p.title} — ${p.photographer} — ${p.license}`}
      aria-hidden={duplicate ? "true" : undefined}
      tabIndex={duplicate ? -1 : undefined}
      className={`sbt-strip-tile sbt-ph${shimmer ? " is-loading" : ""}`}
      draggable={false}
    >
      {load && state !== "error" && (
        <img
          src={p.thumb}
          alt=""
          width={280}
          height={200}
          decoding="async"
          draggable={false}
          className={`sbt-img ${state === "ready" ? "is-ready" : "is-pending"}`}
          onLoad={() => setState("ready")}
          // Keep the tile's box on a dead thumb — collapsing it would change
          // the track width mid-animation and shift the whole strip.
          onError={() => setState("error")}
        />
      )}
      {state === "error" && (
        <span className="sbt-strip-fallback" aria-hidden="true">
          <span className="sbt-strip-fallback-title">{p.title}</span>
          <span className="sbt-strip-fallback-credit">{credit}</span>
        </span>
      )}
      {state !== "error" && (
        <span className="sbt-strip-cap" aria-hidden="true">
          <span className="sbt-strip-cap-title">{p.title}</span>
          <span className="sbt-strip-cap-credit">{credit}</span>
        </span>
      )}
    </a>
  );
});
