// Company logo URL helpers — no API key needed.
// Primary: Clearbit (high-quality vector when available).
// Fallback: Google s2 favicons (always works for any domain).
// Final: colored initial avatar (handled in <CompanyLogo>).

const SUBDOMAIN_STRIP = /^(jobs|careers|invest|investor|developer|developers|store|en-us|www2)\./i;

// Manual overrides for domains that don't map cleanly to a brand logo.
// Key is the lowercased hostname (after stripping `www.`).
const DOMAIN_OVERRIDES: Record<string, string> = {
  "metacareers.com": "meta.com",
  "amat.com": "appliedmaterials.com",
  "jobs.amat.com": "appliedmaterials.com",
  "careers.zoom.us": "zoom.us",
  "careers.hpe.com": "juniper.net",
  "en.wikipedia.org": "",
};

// Direct logo URL overrides keyed by company id. Wins over LOGO_DOMAIN_BY_ID.
// We self-host these because (a) Wikipedia Commons hot-links are blocked by
// Chrome's ORB, and (b) icon.horse / DDG / Google favicons return tiny or
// missing icons for these companies (defunct, deeply-historical, etc.).
const APPLE_LOGO = "/logos/apple.png";
const INTEL_LOGO = "/logos/intel.png";
const GOOGLE_LOGO = "/logos/google.png";

export const LOGO_URL_BY_ID: Record<string, string> = {
  amd: "/logos/amd.png",
  intel: INTEL_LOGO,
  vmware: "/logos/vmware.png",
  android: "/logos/android.png",
  // Tech milestones (anniversary cards) — re-use the parent company's mark.
  "moores-law": INTEL_LOGO,
  "intel-4004": INTEL_LOGO,
  "intel-pentium": INTEL_LOGO,
  "intel-8086": INTEL_LOGO,
  "intel-core2": INTEL_LOGO,
  "mac-introduction": APPLE_LOGO,
  ipod: APPLE_LOGO,
  "iphone-announcement": APPLE_LOGO,
  "app-store-launch": APPLE_LOGO,
  "apple-think-different": APPLE_LOGO,
  "apple-ipo": APPLE_LOGO,
  "apple-acquires-next": APPLE_LOGO,
  "apple-retail": APPLE_LOGO,
  "google-ipo": GOOGLE_LOGO,
  "hp35-calculator": "/logos/hp.png",
};

// Manual overrides keyed by company id — wins over URL-derived domain.
// Use when a company's URL doesn't map to a recognizable logo, or when
// we want to override the auto-derived value.
export const LOGO_DOMAIN_BY_ID: Record<string, string> = {
  "applied-materials": "appliedmaterials.com",
  "linkedin": "linkedin.com",
  "juniper": "juniper.net",
  "western-digital": "westerndigital.com",
  "palo-alto": "paloaltonetworks.com",
  "supermicro": "supermicro.com",
  "sun-microsystems": "oracle.com",
  "netscape": "mozilla.org",
  "yahoo": "yahoo.com",
  "yahoo-ipo": "yahoo.com",
  "moores-law": "intel.com",
  "atari-2600": "atari.com",
  "atari-founding": "atari.com",
  "intel-4004": "intel.com",
  "intel-pentium": "intel.com",
  "intel-8086": "intel.com",
  "intel-core2": "intel.com",
  "palm-computing": "hp.com",
  "palmpilot-launch": "hp.com",
  "java": "oracle.com",
  "vmware": "broadcom.com",
  "fairchild-semiconductor": "intel.com",
  "mac-introduction": "apple.com",
  "ipod": "apple.com",
  "iphone-announcement": "apple.com",
  "app-store-launch": "apple.com",
  "apple-think-different": "apple.com",
  "apple-ipo": "apple.com",
  "apple-acquires-next": "apple.com",
  "apple-retail": "apple.com",
  "android": "google.com",
  "google-ipo": "google.com",
  "tesla": "tesla.com",
  "hp35-calculator": "hp.com",
};

export function urlToDomain(url: string | undefined | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (DOMAIN_OVERRIDES[host] !== undefined) return DOMAIN_OVERRIDES[host];
    host = host.replace(SUBDOMAIN_STRIP, "");
    if (DOMAIN_OVERRIDES[host] !== undefined) return DOMAIN_OVERRIDES[host];
    return host;
  } catch {
    return "";
  }
}

// Primary source — icon.horse serves higher-res PNGs (often 256x256+) sourced
// from a brand's apple-touch-icon, manifest.json, etc. Free, no auth.
export function iconHorseLogo(domain: string): string {
  return domain ? `https://icon.horse/icon/${domain}` : "";
}

// Fallback — DuckDuckGo's icon service. Often higher-quality than Google's.
export function duckDuckGoIcon(domain: string): string {
  return domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : "";
}

// Final fallback — Google s2 favicons. Reliable for any domain, but small.
export function googleFavicon(domain: string, size = 256): string {
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}` : "";
}
