// ---------------------------------------------------------------------------
// Photo strip — auto-scrolling marquee of curated South Bay photos
// ---------------------------------------------------------------------------

import { memo, useState, useEffect } from "react";
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

export default memo(function PhotoStrip({ cityFilter }: Props) {
  // Server render and first client render show a fixed-height placeholder;
  // the strip itself mounts once, post-hydration, with its per-visit random
  // order. Rendering real photos with a build-time seed first and reshuffling
  // after mount swaps ~17 of 20 tiles mid-animation (the pool is ~139) —
  // every thumb fetched twice and the marquee stutters through hydration.
  const [seed, setSeed] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setSeed(Math.floor(Math.random() * 1_000_000)); }, []);

  // A tagged-but-thin city pool can't fill a seamless loop, so fall back to
  // the full pool rather than repeat the same handful of tiles.
  const cityPool = cityFilter ? ALL_PHOTOS.filter((p) => p.city === cityFilter) : ALL_PHOTOS;
  const pool = cityPool.length >= MIN_CITY_POOL ? cityPool : ALL_PHOTOS;

  if (pool.length < 4) return null;
  if (seed === null) {
    return (
      <div style={{ overflow: "hidden", borderRadius: 12 }}>
        <div style={{ height: 200 }} />
      </div>
    );
  }
  const strip = seededShuffle(pool, seed).slice(0, Math.min(20, pool.length));

  // `duplicate` marks the second, translateX(-50%)-only copy of the loop: it
  // exists purely so the marquee wraps seamlessly and must be invisible to
  // keyboard/AT users, who would otherwise hit every photo twice per lap.
  const tile = (p: CuratedPhoto, keySuffix: string, duplicate: boolean) => (
    <a
      key={p.id + keySuffix}
      href={p.photoPage}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={duplicate ? undefined : `${p.title} — ${p.photographer} — ${p.license}`}
      aria-hidden={duplicate ? "true" : undefined}
      tabIndex={duplicate ? -1 : undefined}
      style={{
        flexShrink: 0, display: "block", position: "relative",
        height: 200, width: 280, overflow: "hidden", background: "#ccc",
        borderRadius: 6,
        // Spacing via margin, not flex gap: every tile is exactly 283px of
        // pitch, so one copy is 20×283 and translateX(-50%) lands precisely
        // on the second copy — flex gap left the loop 1.5px (gap/2) short,
        // a visible snap every 90s cycle.
        marginRight: 3,
      }}
    >
      <img
        src={p.thumb}
        alt={p.title}
        decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        // Keep the 280px box on a dead thumb (gray placeholder) — collapsing
        // the tile changes track width mid-animation and shifts the strip.
        onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
      />
      <div className="ps-caption">
        <span style={{ fontSize: 9, color: "#fff", fontFamily: "'Space Mono', monospace", lineHeight: 1.5 }}>
          {p.photographer ? `${p.photographer} · ` : ""}{p.license}
        </span>
      </div>
    </a>
  );

  return (
    <div style={{ overflow: "hidden", borderRadius: 12, position: "relative" }}>
      <div className={`photo-strip-track${paused ? " is-paused" : ""}`}>
        {strip.map(p => tile(p, "-a", false))}
        {strip.map(p => tile(p, "-b", true))}
      </div>
      <button
        type="button"
        className="ps-pause-toggle"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Play photo scroll" : "Pause photo scroll"}
      >
        {paused ? "▶" : "❚❚"}
      </button>
      {/*
        NOTE: @keyframes photo-scroll / .photo-strip-track / .ps-caption below
        are byte-identical to SignalShell.astro's copy. That looks like drift
        but isn't: PhotoStrip also mounts on /city/[slug] pages, which use
        BaseLayout (not SignalShell) and never load SignalShell's CSS — so
        this copy is load-bearing there. Do not delete without giving city
        pages their own way to load the marquee styles first.
      */}
      <style>{`
        @keyframes photo-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .photo-strip-track {
          display: flex;
          width: max-content;
          animation: photo-scroll 90s linear infinite;
          will-change: transform;
        }
        .photo-strip-track:hover { animation-play-state: paused; }
        .photo-strip-track.is-paused { animation-play-state: paused; }
        .ps-caption {
          position: absolute; bottom: 0; left: 0; right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,0.7));
          padding: 20px 8px 6px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .photo-strip-track a:hover .ps-caption { opacity: 1; }
        .photo-strip-track a:focus-within .ps-caption { opacity: 1; }
        .ps-pause-toggle {
          position: absolute;
          bottom: 8px;
          right: 8px;
          z-index: 2;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 50%;
          background: rgba(18, 6, 47, 0.62);
          color: #fff;
          font-size: 11px;
          line-height: 1;
          cursor: pointer;
        }
        .ps-pause-toggle:hover,
        .ps-pause-toggle:focus-visible {
          background: rgba(18, 6, 47, 0.85);
        }
      `}</style>
    </div>
  );
});
