import { useState } from "react";
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
  borderRadius = 8,
  fallbackColor,
  className,
  style,
  bordered = true,
  directUrl,
}: CompanyLogoProps) {
  const candidates = [
    directUrl,
    localFavicon(domain),
    iconHorseLogo(domain),
    duckDuckGoIcon(domain),
    googleFavicon(domain, 256),
  ].filter((u): u is string => Boolean(u));

  const [step, setStep] = useState(0);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const bg = fallbackColor || "#94a3b8";

  if (candidates.length === 0 || step >= candidates.length) {
    return (
      <div
        className={className}
        aria-label={name}
        style={{
          width: size,
          height: size,
          borderRadius,
          background: bg,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: Math.round(size * 0.42),
          fontFamily: "var(--sb-sans)",
          flexShrink: 0,
          letterSpacing: "-0.01em",
          ...style,
        }}
      >
        {initial}
      </div>
    );
  }

  const src = candidates[step];
  const isDirectUrl = step === 0 && Boolean(directUrl);

  const advance = () => setStep((s) => s + 1);

  return (
    <img
      src={src}
      alt={`${name} logo`}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={advance}
      onLoad={(e) => {
        // icon.horse and DuckDuckGo return tiny placeholders (200 status,
        // tiny payload) for missing logos. onError doesn't fire — detect via
        // suspiciously small natural width. Skip on directUrl — those are
        // pinned high-res assets we trust. Use the larger of nw/nh because
        // wordmark logos are wide and short (e.g. AMD is 512x123).
        if (isDirectUrl) return;
        const img = e.currentTarget;
        const dim = Math.max(img.naturalWidth, img.naturalHeight);
        if (dim > 0 && dim < 24) advance();
      }}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius,
        background: "#fff",
        objectFit: "contain",
        flexShrink: 0,
        border: bordered ? "1px solid var(--sb-border-light)" : "none",
        padding: bordered ? 4 : 0,
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}
