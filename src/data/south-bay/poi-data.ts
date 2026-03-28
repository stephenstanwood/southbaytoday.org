// ---------------------------------------------------------------------------
// South Bay Signal — Points of Interest (always-available venues)
// Used by Plan My Day to fill itinerary slots with non-event options.
// ---------------------------------------------------------------------------

import type { City } from "../../lib/south-bay/types";

export type POICategory = "outdoor" | "museum" | "neighborhood" | "food";
export type TimeSlotKey = "morning" | "afternoon" | "evening";

export interface POI {
  id: string;
  title: string;
  city: City;
  venue: string;
  category: POICategory;
  cost: "free" | "low" | "paid";
  costNote?: string;
  kidFriendly: boolean;
  description: string; // shown in card
  why: string; // short hook: why this fits
  emoji: string;
  url?: string;
  indoorOutdoor: "indoor" | "outdoor" | "both";
  bestSlots: TimeSlotKey[];
}

export const SOUTH_BAY_POIS: POI[] = [
  // ── OUTDOOR / NATURE ────────────────────────────────────────────────────────

  {
    id: "rancho-san-antonio",
    title: "Rancho San Antonio Open Space",
    city: "los-altos",
    venue: "Rancho San Antonio County Park",
    category: "outdoor",
    cost: "free",
    kidFriendly: true,
    description:
      "3,900-acre preserve with 24+ miles of trails, deer meadow, and sweeping Bay Area views.",
    why: "The best hiking in the South Bay — free, beautiful, accessible to all fitness levels",
    emoji: "🥾",
    url: "https://www.openspace.org/preserves/rancho-san-antonio",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "vasona-lake",
    title: "Vasona Lake County Park",
    city: "los-gatos",
    venue: "Vasona Lake County Park",
    category: "outdoor",
    cost: "low",
    costNote: "$6 parking",
    kidFriendly: true,
    description:
      "Peaceful lake, duck pond, easy walking trails, and the Billy Jones Wildcat Railroad (seasonal for kids).",
    why: "A beloved family spot — lake views, easy trails, kids love the little train",
    emoji: "🦆",
    url: "https://www.sccgov.org/sites/parks/Pages/Vasona-Lake.aspx",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "shoreline-park",
    title: "Shoreline Park & Lake",
    city: "mountain-view",
    venue: "Shoreline at Mountain View",
    category: "outdoor",
    cost: "free",
    kidFriendly: true,
    description:
      "Bay Trail access, a lake with boat and bike rentals, windsurfing, and wide-open Bay views.",
    why: "Big open space right on the Bay — great for a walk, bike ride, or just watching the water",
    emoji: "🌊",
    url: "https://www.mountainview.gov/depts/cs/shoreline/default.asp",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "los-gatos-creek-trail",
    title: "Los Gatos Creek Trail",
    city: "campbell",
    venue: "Los Gatos Creek Trail (Campbell Trailhead)",
    category: "outdoor",
    cost: "free",
    kidFriendly: true,
    description:
      "Paved multi-use trail connecting Campbell through Los Gatos, following the creek through parks and neighborhoods.",
    why: "Easy, shaded, and peaceful — perfect for a morning walk or bike ride along the creek",
    emoji: "🚴",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "the-dish",
    title: "The Dish Trail",
    city: "palo-alto",
    venue: "Stanford Foothills (Stanford Ave trailhead)",
    category: "outdoor",
    cost: "free",
    kidFriendly: false,
    description:
      "3.5-mile loop through Stanford's rolling foothills, passing the massive radio telescope and ending with panoramic Bay Area views.",
    why: "Iconic South Bay hike with stunning views — worth every step of the climb",
    emoji: "📡",
    url: "https://dish.stanford.edu",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "alum-rock-park",
    title: "Alum Rock Park",
    city: "san-jose",
    venue: "Alum Rock Park",
    category: "outdoor",
    cost: "free",
    kidFriendly: true,
    description:
      "San Jose's oldest park — creekside canyon trails, mineral springs, and forested hillsides.",
    why: "A hidden gem in the foothills — peaceful and free, great for families and solo explorers",
    emoji: "🌲",
    url: "https://www.sanjoseca.gov/your-government/departments-offices/parks-recreation-neighborhood-services/parks/alum-rock-park",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "hakone-gardens",
    title: "Hakone Estate & Gardens",
    city: "saratoga",
    venue: "Hakone Estate & Gardens",
    category: "outdoor",
    cost: "low",
    costNote: "$10–15",
    kidFriendly: true,
    description:
      "The oldest Japanese residential garden in the Western Hemisphere — serene, historic, and beautifully maintained.",
    why: "A truly special place that feels miles away from Silicon Valley's pace",
    emoji: "🎋",
    url: "https://www.hakone.com",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "villa-montalvo",
    title: "Montalvo Arts Center Arboretum",
    city: "saratoga",
    venue: "Montalvo Arts Center",
    category: "outdoor",
    cost: "free",
    kidFriendly: true,
    description:
      "Free arboretum trails through a historic hilltop estate. Art installations scattered through the grounds, with regular concerts.",
    why: "One of the area's best-kept secrets — free outdoor trails through a gorgeous historic estate",
    emoji: "🌿",
    url: "https://montalvoarts.org",
    indoorOutdoor: "both",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "stevens-creek-trail",
    title: "Stevens Creek Trail",
    city: "mountain-view",
    venue: "Stevens Creek Trail (Mountain View)",
    category: "outdoor",
    cost: "free",
    kidFriendly: true,
    description:
      "Paved trail running from Mountain View through Cupertino, with bay views and access to Shoreline Park.",
    why: "Flat, scenic, and easy — great for strollers, bikes, or a casual morning walk",
    emoji: "🛤️",
    indoorOutdoor: "outdoor",
    bestSlots: ["morning", "afternoon"],
  },

  // ── MUSEUMS / INDOOR ─────────────────────────────────────────────────────────

  {
    id: "computer-history-museum",
    title: "Computer History Museum",
    city: "mountain-view",
    venue: "Computer History Museum",
    category: "museum",
    cost: "low",
    costNote: "$20 adults / $13 kids",
    kidFriendly: true,
    description:
      "The definitive museum of the computing revolution — from the first calculators to modern AI — right in Silicon Valley.",
    why: "Fascinating even if you're not a tech person — the history here is genuinely wild",
    emoji: "💾",
    url: "https://computerhistory.org",
    indoorOutdoor: "indoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "tech-interactive",
    title: "The Tech Interactive",
    city: "san-jose",
    venue: "The Tech Interactive, Downtown San Jose",
    category: "museum",
    cost: "paid",
    costNote: "$30+ adults",
    kidFriendly: true,
    description:
      "Hands-on science and technology museum in downtown San Jose, with an IMAX dome theater.",
    why: "Kids go wild here — everything is interactive and there's an IMAX theater on-site",
    emoji: "🔬",
    url: "https://thetech.org",
    indoorOutdoor: "indoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "childrens-discovery-museum",
    title: "Children's Discovery Museum",
    city: "san-jose",
    venue: "Children's Discovery Museum of San Jose",
    category: "museum",
    cost: "low",
    costNote: "$15 per person",
    kidFriendly: true,
    description:
      "Play-based learning museum in downtown San Jose, designed specifically for ages 2–10.",
    why: "Young kids absolutely love it — designed entirely around hands-on play and wonder",
    emoji: "🎨",
    url: "https://www.cdm.org",
    indoorOutdoor: "indoor",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "cantor-arts",
    title: "Cantor Arts Center",
    city: "palo-alto",
    venue: "Cantor Arts Center, Stanford University",
    category: "museum",
    cost: "free",
    kidFriendly: true,
    description:
      "World-class art museum on Stanford's campus — completely free, always. The outdoor Rodin sculpture garden alone is worth the visit.",
    why: "Free world-class art including the famous Rodin sculptures — always worth a trip to campus",
    emoji: "🗿",
    url: "https://museum.stanford.edu",
    indoorOutdoor: "both",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "sjma",
    title: "San Jose Museum of Art",
    city: "san-jose",
    venue: "San Jose Museum of Art",
    category: "museum",
    cost: "low",
    costNote: "$20 adults, free 3rd Fridays",
    kidFriendly: false,
    description:
      "Contemporary and modern art museum in the heart of downtown San Jose's civic plaza.",
    why: "Great contemporary art — go free on the third Friday of the month",
    emoji: "🖼️",
    url: "https://sjmusart.org",
    indoorOutdoor: "indoor",
    bestSlots: ["afternoon"],
  },

  // ── NEIGHBORHOODS / FOOD ─────────────────────────────────────────────────────

  {
    id: "downtown-campbell",
    title: "Downtown Campbell",
    city: "campbell",
    venue: "Campbell Ave & E Campbell Ave",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "Charming walkable downtown with excellent coffee, restaurants, boutiques, and a relaxed local vibe.",
    why: "One of the best walkable downtowns in the South Bay — great food, zero pretension",
    emoji: "☕",
    indoorOutdoor: "both",
    bestSlots: ["morning", "afternoon", "evening"],
  },
  {
    id: "santana-row",
    title: "Santana Row",
    city: "san-jose",
    venue: "Santana Row, San Jose",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "Upscale open-air shopping and dining district — European-style streets with restaurants, wine bars, and boutiques.",
    why: "Leisurely and beautiful — great for a slow afternoon or evening out",
    emoji: "🛍️",
    url: "https://www.santanarow.com",
    indoorOutdoor: "both",
    bestSlots: ["afternoon", "evening"],
  },
  {
    id: "castro-street-mv",
    title: "Castro Street, Mountain View",
    city: "mountain-view",
    venue: "Castro Street, Mountain View",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "Lively, pedestrian-friendly downtown with diverse restaurants, coffee shops, and regular community events.",
    why: "Excellent walkable downtown with a great restaurant scene — especially good for lunch",
    emoji: "🍜",
    indoorOutdoor: "both",
    bestSlots: ["afternoon", "evening"],
  },
  {
    id: "los-gatos-village",
    title: "Los Gatos Village",
    city: "los-gatos",
    venue: "Santa Cruz Ave & N Santa Cruz Ave, Los Gatos",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "Charming foothill town with excellent brunch spots, boutiques, and a relaxed California pace.",
    why: "Feels like a getaway without going far — beautiful downtown with some of the best brunch in the South Bay",
    emoji: "🏡",
    indoorOutdoor: "both",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "san-pedro-square",
    title: "San Pedro Square Market",
    city: "san-jose",
    venue: "San Pedro Square Market",
    category: "food",
    cost: "free",
    kidFriendly: true,
    description:
      "Downtown San Jose food hall with diverse vendors, outdoor seating, and a lively atmosphere.",
    why: "Great for lunch or an afternoon snack run — lots of options in one spot",
    emoji: "🍱",
    url: "https://www.sanpedrosquaremarket.com",
    indoorOutdoor: "both",
    bestSlots: ["afternoon", "evening"],
  },
  {
    id: "willow-glen",
    title: "Willow Glen",
    city: "san-jose",
    venue: "Lincoln Ave, Willow Glen, San Jose",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "San Jose's most charming neighborhood — tree-lined Lincoln Ave with indie shops, patisseries, and great brunch spots.",
    why: "The most charming neighborhood in San Jose — great for a slow weekend morning browse",
    emoji: "🌷",
    indoorOutdoor: "both",
    bestSlots: ["morning", "afternoon"],
  },
  {
    id: "downtown-sunnyvale",
    title: "Downtown Sunnyvale",
    city: "sunnyvale",
    venue: "Murphy Ave, Downtown Sunnyvale",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "Murphy Avenue has a walkable strip of restaurants, a craft beer garden, and a relaxed neighborhood feel.",
    why: "Underrated — solid restaurant row with a chill local atmosphere",
    emoji: "🍻",
    indoorOutdoor: "both",
    bestSlots: ["afternoon", "evening"],
  },
  {
    id: "downtown-palo-alto",
    title: "Downtown Palo Alto",
    city: "palo-alto",
    venue: "University Ave, Palo Alto",
    category: "neighborhood",
    cost: "free",
    kidFriendly: true,
    description:
      "Tree-lined University Avenue with independent restaurants, bookstores, and coffee shops a block from Stanford.",
    why: "Classic Palo Alto walkability — great food and very close to Stanford campus",
    emoji: "🌳",
    indoorOutdoor: "both",
    bestSlots: ["morning", "afternoon", "evening"],
  },
];
