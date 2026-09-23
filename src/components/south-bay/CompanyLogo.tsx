import { useEffect, useRef, useState } from "react";
import { iconHorseLogo, duckDuckGoIcon, googleFavicon, localFavicon } from "../../lib/south-bay/tech-logos";

interface CompanyLogoProps {
  domain: string;
  name: string;
  size?: number;
  borderRadius?: number;
  fallbackColor?: string;
  className?: string;
  style?: React.CSSProperties;
  bordered?: boolean;
  /** Pinned high-res URL (e.g. Wikipedia Commons) — wins over the cascade. */
  directUrl?: string;
  /** The company name is printed right beside every logo on the site, so the
   * mark is decorative by default (alt=""). Pass false to announce it. */
  decorative?: boolean;
}

// Renders a company logo with a 5-tier fallback chain (best quality first):
//   1. self-hosted favicon, pre-fetched once by fetch-tech-favicons.mjs
//      (skips a live request entirely for companies we've already cached)
//   2. icon.horse (256x256 from apple-touch-icon, manifest, etc.)
//   3. DuckDuckGo icons (decent quality, very broad coverage)
//   4. Google s2 favicons sz=256 (works for any domain, sometimes small)
//   5. colored initial avatar (always works)
// directUrl (a pinned high-res asset) short-circuits the whole cascade.
export function CompanyLogo({
  domain,
  name,
  size = 40,
  borderRadius = 10,
  fallbackColor,
  className,
  style,
  bordered = true,
  directUrl,
  decorative = true,
}: CompanyLogoProps) {
  const candidates = [
    directUrl,
    localFavicon(domain),
    iconHorseLogo(domain),
    duckDuckGoIcon(domain),
    googleFavicon(domain, 256),
  ].filter((u): u is string => Boolean(u));

  const [step, setStep] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const bg = fallbackColor || "#94a3b8";
  const isDirectUrl = step === 0 && Boolean(directUrl);

  const advance = () => setStep((s) => s + 1);

  // icon.horse and DuckDuckGo return tiny placeholders (200 status, tiny
  // payload) for missing logos. onError doesn't fire — detect via
  // suspiciously small natural width. Skip on directUrl — those are pinned
  // high-res assets we trust. Use the larger of nw/nh because wordmark
  // logos are wide and short (e.g. AMD is 512x123).
  const isPlaceholder = (img: HTMLImageElement) => {
    if (isDirectUrl) return false;
    const dim = Math.max(img.naturalWidth, img.naturalHeight);
    return dim > 0 && dim < 24;
  };

  // The page is server-rendered, so an image can finish (or fail) before
  // React attaches onLoad/onError. Re-check once mounted so a dead URL still
  // falls through to the next source instead of leaving a broken-image icon.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth === 0 || isPlaceholder(img)) advance();
  }, [step]);

  if (candidates.length === 0 || step >= candidates.length) {
    return (
      <div
        className={className}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : name}
        aria-hidden={decorative ? true : undefined}
        style={{
          width: size,
          height: size,
          borderRadius,
          background: bg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: Math.round(size * 0.42),
          fontFamily: "var(--sb-sans)",
          flexShrink: 0,
          letterSpacing: "-0.01em",
          textShadow: "0 1px 1px rgba(19, 7, 47, 0.18)",
          boxShadow: "inset 0 0 0 1px rgba(19, 7, 47, 0.06)",
          ...style,
        }}
      >
        {initial}
      </div>
    );
  }

  const src = candidates[step];

  return (
    <img
      ref={imgRef}
      src={src}
      alt={decorative ? "" : `${name} logo`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={advance}
      onLoad={(e) => {
        if (isPlaceholder(e.currentTarget)) advance();
      }}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius,
        background: "#fff",
        objectFit: "contain",
        flexShrink: 0,
        border: bordered ? "1px solid var(--sb-line)" : "none",
        padding: bordered ? Math.max(3, Math.round(size * 0.1)) : 0,
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}
