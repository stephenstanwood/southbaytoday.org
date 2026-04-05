// ---------------------------------------------------------------------------
// South Bay Signal — Social Posting Configuration
// ---------------------------------------------------------------------------

export const CONFIG = {
  DRY_RUN: true,
  PLATFORMS: { x: true, threads: true, bluesky: true, facebook: true },
  FORMATS: { daily_pulse: true, tonight: true, weekend: true, civic: true },
  THRESHOLDS: { daily_pulse: 40, tonight: 35, weekend: 60, civic: 50 },
  BLACKLIST_FILE: "src/data/south-bay/social-blacklist.json",
  HISTORY_FILE: "src/data/south-bay/social-post-history.json",
  HISTORY_RETENTION_DAYS: 30,
  CARD_OUTPUT_DIR: "/tmp/sbs-social-cards",
  SBS_BASE_URL: "https://southbaysignal.org",
};

// Use Haiku for now — can upgrade to Sonnet when API key permits
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Scoring weights
export const SCORE_WEIGHTS = {
  localRelevance: { max: 5 },
  timeliness: { max: 5 },
  usefulness: { max: 5 },
  novelty: { max: 4 },
  specificity: { max: 3 },
  publicAppeal: { max: 3 },
  sourceConfidence: { max: 3 },
};

// Scoring penalties
export const SCORE_PENALTIES = {
  recentDuplicate: -8,
  sameVenueThisWeek: -4,
  sameCategorySaturation: -3,
  staleItem: -5,
  adminNoise: -10,
  weakSummary: -3,
};

// Diversity constraints
export const DIVERSITY = {
  maxSameCity: 2,
  maxSameCategory: 2,
  minUniqueCities: 2,
};

// Category mapping for normalization
export const CATEGORY_MAP = {
  arts: "arts",
  music: "arts",
  community: "community",
  market: "community",
  family: "community",
  sports: "sports",
  outdoor: "outdoor",
  education: "education",
  food: "food",
  civic: "civic",
  council: "civic",
  permit: "civic",
  development: "development",
  transit: "transit",
};

// City display names
export const CITY_NAMES = {
  "san-jose": "San Jose",
  campbell: "Campbell",
  "los-gatos": "Los Gatos",
  saratoga: "Saratoga",
  cupertino: "Cupertino",
  sunnyvale: "Sunnyvale",
  "mountain-view": "Mountain View",
  "palo-alto": "Palo Alto",
  "santa-clara": "Santa Clara",
  "los-altos": "Los Altos",
  milpitas: "Milpitas",
};

// Admin noise keywords (items containing these get penalized)
export const ADMIN_NOISE = [
  "minutes approved",
  "roll call",
  "adjournment",
  "consent calendar",
  "proclamation",
  "closed session",
  "ceremonial",
  "flag salute",
];

// SBS tab URLs for CTAs
export const TAB_URLS = {
  today: "/",
  plan: "/?tab=plan",
  events: "/?tab=events",
  gov: "/?tab=gov",
  tech: "/?tab=tech",
  development: "/?tab=development",
  transit: "/?tab=transit",
  sports: "/?tab=sports",
};
