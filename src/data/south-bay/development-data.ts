// ---------------------------------------------------------------------------
// South Bay Signal — Development Tracker
// Curated major development projects across the South Bay
// Data reflects publicly reported information as of June 2026
// ---------------------------------------------------------------------------

export type DevStatus =
  | "proposed"
  | "approved"
  | "under-construction"
  | "opening-soon"
  | "completed"
  | "on-hold";

export type DevCategory =
  | "transit"
  | "tech-campus"
  | "mixed-use"
  | "housing"
  | "retail"
  | "civic"
  | "infrastructure";

export interface DevProject {
  id: string;
  name: string;
  city: string;        // display name
  cityId: string;      // matches City type
  category: DevCategory;
  status: DevStatus;
  description: string;
  scale?: string;      // "7.3M sq ft", "4,000+ units", "$4.5B"
  developer?: string;
  // Use a sourced near-term milestone or confirmed status; omit guessed dates.
  // Projects with 2030s+ or open-ended long-term delivery do not belong here.
  timeline?: string;
  featured?: boolean;
  sourceNote?: string; // brief context on data source
}

// ── Status display config ───────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  DevStatus,
  { label: string; color: string; bg: string }
> = {
  proposed:           { label: "Proposed",          color: "#6b7280", bg: "#f3f4f6" },
  approved:           { label: "Approved",           color: "#1d4ed8", bg: "#eff6ff" },
  "under-construction": { label: "Under Construction", color: "#b45309", bg: "#fffbeb" },
  "opening-soon":     { label: "Opening Soon",       color: "#15803d", bg: "#f0fdf4" },
  completed:          { label: "Completed",          color: "#065f46", bg: "#ecfdf5" },
  "on-hold":          { label: "On Hold",            color: "#9ca3af", bg: "#f9fafb" },
};

export const CATEGORY_LABELS: Record<DevCategory, string> = {
  transit:      "Transit",
  "tech-campus": "Tech Campus",
  "mixed-use":  "Mixed-Use",
  housing:      "Housing",
  retail:       "Retail",
  civic:        "Civic",
  infrastructure: "Infrastructure",
};

// ── Projects ────────────────────────────────────────────────────────────────
//
// The section headers below are navigation aids only and drift as projects
// change state (Google Downtown West sits under "UNDER CONSTRUCTION" but is
// on-hold). The `status` field is authoritative — it drives STATUS_CONFIG and
// DEV_PULSE. Update `status` when a project moves; don't trust the header.
//
// Entries whose `developer` is "Various" are rollups of several separate
// projects, not a single tracked permit — they carry a sourceNote saying so.

export const DEV_PROJECTS: DevProject[] = [

  // ── OPENING SOON ────────────────────────────────────────────────────────

  {
    id: "related-santa-clara",
    name: "Related Santa Clara",
    city: "Santa Clara",
    cityId: "santa-clara",
    category: "mixed-use",
    status: "approved",
    description:
      "Formerly CityPlace Santa Clara, this planned mixed-use development next to Levi's Stadium includes offices, hotels, retail, and entertainment. Santa Clara approved the project in June 2016. San José challenged the environmental review, and the cities reached a settlement in January 2018.",
    scale: "Multi-building campus",
    developer: "Related Companies",
    timeline: "TBD",
    featured: false,
    sourceNote: "City of Santa Clara project record: https://www.santaclaraca.gov/Home/Components/BusinessDirectory/BusinessDirectory/216/2495. Joint settlement announcement: https://www.santaclaraca.gov/Home/Components/News/News/36280/3171",
  },

  // ── UNDER CONSTRUCTION ──────────────────────────────────────────────────

  {
    id: "google-downtown-west",
    name: "Google Downtown West",
    city: "San José",
    cityId: "san-jose",
    category: "mixed-use",
    status: "on-hold",
    description:
      "The San José City Council approved Google's 80-acre mixed-use district next to Diridon Station in 2021. The plan calls for up to 7.3M sq ft of office space, plus 4,000 homes, parks, and retail. Google and Lendlease ended their development partnership in 2023, and the project is on hold. The development agreement gives Google three ways to meet a ten-year milestone. Google can substantially complete at least 2 million sq ft of office space and make all required payments and contributions for that construction. Google can also provide the community benefits tied to 2 million sq ft of office space without building that space, or combine the two approaches.",
    scale: "Up to 7.3M sq ft of office space and 4,000 homes planned",
    developer: "Google (Lendlease partnership ended 2023)",
    timeline: "Entitled in 2021. Project on hold.",
    featured: true,
    sourceNote: "San José's Downtown West project page gives the approved scope at https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/planning-division/major-development-projects/downtown-west-mixed-use-plan. Development Agreement §§ 1.117 and 2.2 define the ten-year obligation and possible extensions at https://www.sanjoseca.gov/home/showpublisheddocument/77459/637680918932500000. Lendlease announced the end of the partnership at https://www.lendlease.com/siteassets/lendlease/shared/investor-centre/announcements/asx/2023/11/2635882.pdf.",
  },

  {
    id: "milpitas-transit-district",
    name: "Milpitas Metro Specific Plan",
    city: "Milpitas",
    cityId: "milpitas",
    category: "housing",
    status: "approved",
    description:
      "The city's Metro Specific Plan guides development around the Milpitas BART station, where homes have been built and shops have opened. VTA accepted proposals in summer 2026 for mixed-use development on its 1.7-acre parcel beside the transit center.",
    developer: "Various",
    timeline: "Metro Specific Plan adopted February 2023",
    featured: false,
    sourceNote: "The plan covers multiple developments around the Milpitas station. See the city's adopted plan at https://www.milpitas.gov/371/Milpitas-Metro-Specific-Plan and VTA's separate station-parcel proposal at https://www.vta.org/projects/milpitas-transit-center-transit-oriented-development.",
  },

  {
    id: "campbell-downtown-infill",
    name: "Downtown Campbell Mixed-Use Infill",
    city: "Campbell",
    cityId: "campbell",
    category: "mixed-use",
    status: "approved",
    description:
      "Campbell has approved housing above ground-floor retail along East Campbell Avenue. In February 2026, the Planning Commission approved 90 homes and about 5,000 sq ft of ground-floor retail at 600 E. Campbell Ave. The approval includes an option for up to 120 homes under the city's density bonus program.",
    developer: "Various",
    featured: false,
    sourceNote: "This entry covers infill along the corridor. The February 10 Planning Commission minutes record the approval at 600 E. Campbell Ave. (PLN-2025-3): https://www.campbellca.gov/AgendaCenter/ViewFile/Agenda/_02242026-3207.",
  },

  {
    id: "downtown-campbell-market",
    name: "The Pruneyard Master Use Permit",
    city: "Campbell",
    cityId: "campbell",
    category: "retail",
    status: "approved",
    description:
      "Campbell approved a long-term master plan for The Pruneyard's office, retail, parking, and public-space improvements in 2016 and amended it in 2021. The plan allows phased development; the approval alone does not establish that construction is currently underway.",
    scale: "27-acre shopping and office center",
    timeline: "Approved 2016; amended 2021",
    featured: false,
    sourceNote: "City of Campbell, Pruneyard Master Use Permit: https://campbellca.gov/771/Pruneyard-MUP. Current construction phase and developer attribution are unverified.",
  },

  {
    id: "mineta-airport-terminal",
    name: "SJC Terminal B South Concourse Improvements",
    city: "San José",
    cityId: "san-jose",
    category: "civic",
    status: "proposed",
    description:
      "The proposed expansion would add gates and increase concourse capacity at the south end of Terminal B at San José Mineta International Airport. The FAA issued a finding of no significant impact and record of decision in April 2023. The City Council adopted the broader Airport Master Plan amendment in May 2026.",
    scale: "Terminal B south concourse expansion",
    developer: "City of San José",
    timeline: "FAA environmental decision in April 2023",
    featured: false,
    sourceNote: "SJC lists the May 2026 master plan amendment and the Terminal B environmental decision at https://www.flysanjose.com/environmental-planning-and-review-test.",
  },

  {
    id: "supermicro-brokaw",
    name: "Super Micro Computer Manufacturing Expansion",
    city: "San José",
    cityId: "san-jose",
    category: "tech-campus",
    status: "under-construction",
    description:
      "Super Micro Computer (NASDAQ: SMCI) is building a new manufacturing facility at 688 E Brokaw Road in North San José, permitted in March 2026. The $72M warm-shell build-out will expand SMCI's AI server production capacity as demand for its GPU server systems continues to climb. Supermicro has its global headquarters and major manufacturing operations across San José.",
    scale: "$72M facility",
    developer: "Super Micro Computer",
    timeline: "Permitted March 2026",
    featured: false,
    sourceNote: "Permit details from San José city permit records, March 2026. Verify permit status at sjpermits.org.",
  },

  {
    id: "summer-hill-homes-los-gatos",
    name: "Solana at Los Gatos Lodge (SummerHill Homes)",
    city: "Los Gatos",
    cityId: "los-gatos",
    category: "housing",
    status: "under-construction",
    description:
      "SummerHill Homes is redeveloping the former Los Gatos Lodge site — a historic 8.9-acre motor inn at 50 Los Gatos-Saratoga Road that closed in September 2025 — into 155 townhome-style condominiums called Solana. The project was approved unanimously by the Los Gatos Town Council in March 2025 (the town's first SB 330 streamlined application) and SummerHill closed on the $78M property in October 2025. Groundbreaking followed in November 2025. The three-story Spanish Revival buildings include 26 affordable units (16 low-income, 10 moderate-income) priced around $400K–$600K; market-rate units are expected to list around $1.5M–$2M. Each home will include solar panels, and the site includes a pedestrian path to Los Gatos High School.",
    scale: "155 townhome condos (26 affordable), 8.9 acres",
    developer: "SummerHill Homes",
    timeline: "Groundbreaking Nov 2025; move-ins expected 2027",
    featured: false,
    sourceNote: "Sources: Los Gatan, SF YIMBY, The Real Deal (Oct 2025). Verify current sales/construction status at summerhill.com.",
  },

  // ── APPROVED ────────────────────────────────────────────────────────────

  {
    id: "mv-east-middlefield-mixed-use",
    name: "490 East Middlefield Road Mixed-Use Development",
    city: "Mountain View",
    cityId: "mountain-view",
    category: "mixed-use",
    status: "approved",
    description:
      "The Mountain View City Council approved the development agreement for a mixed-use residential project at 490 East Middlefield Road on March 24, 2026. The project adds residential units to one of Mountain View's key transit corridors, consistent with the city's goals for housing near employment centers and transit.",
    scale: "Residential + ground-floor uses",
    developer: "WTA Middlefield, LLC",
    timeline: "Approved March 2026",
    featured: false,
    sourceNote:
      "Mountain View City Council item 205958 names WTA Middlefield, LLC in the development agreement and records approval on March 24, 2026: https://mountainview.legistar.com/LegislationDetail.aspx?GUID=54271253-87EC-4C53-9F9E-2924DB4F7D2F&ID=7956718.",
  },

  {
    id: "algarve-apartments-san-jose",
    name: "Algarve Apartments",
    city: "San José",
    cityId: "san-jose",
    category: "housing",
    status: "under-construction",
    description:
      "Abode Housing Development is building 91 affordable homes at 1135 East Santa Clara Street in San José. The eight-story building includes 24 apartments for military veterans and 36 permanent supportive homes for people who have experienced homelessness.",
    scale: "91 affordable units, 8 stories",
    developer: "Abode Housing Development",
    timeline: "Under construction as of November 2026",
    featured: false,
    sourceNote:
      "Abode's project page gives the current construction status, building height, and unit mix: https://abode.org/housing-sites/algarve-community-apartments. San José's earlier planning record identifies an AB 2162 ministerial permit: https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/planning-division/environmental-planning/environmental-review/negative-declaration-initial-studies/1135-e-santa-clara-street-algarve-development-project-h20-001.",
  },

  {
    id: "santa-clara-station-area-plan",
    name: "Santa Clara Station Area Specific Plan",
    city: "Santa Clara",
    cityId: "santa-clara",
    category: "mixed-use",
    status: "proposed",
    description:
      "The city is drafting a plan for housing, jobs, and better walking connections around the Santa Clara Transit Station. The station serves Caltrain, Altamont Corridor Express, and VTA buses, with a BART station planned nearby.",
    scale: "244 acres around Santa Clara Transit Station",
    developer: "City of Santa Clara",
    timeline: "Public environmental scoping in June 2026",
    featured: false,
    sourceNote:
      "The city's Specific Plan page maps the 244-acre boundary and documents the June 29, 2026 public scoping meeting: https://www.santaclaraca.gov/our-city/departments-a-f/community-development/planning-division/specific-plans/santa-clara-station-focus-area-plan.",
  },

  {
    id: "berryessa-bart-transit-village",
    name: "Berryessa BART Urban Village",
    city: "San José",
    cityId: "san-jose",
    category: "housing",
    status: "approved",
    description:
      "San José adopted the Berryessa BART Urban Village Plan in June 2021. It calls for housing and commercial development across roughly 270 acres around the Berryessa/North San José BART station. Development proceeds through separate site applications.",
    scale: "5,100 additional homes in the adopted plan",
    developer: "Various",
    timeline: "Urban Village Plan adopted June 2021",
    featured: false,
    sourceNote: "The adopted Berryessa BART Urban Village Plan, Land Use chapter, page 23, allocates 5,100 new homes beyond the 1,416 already entitled or built at adoption, for a total capacity of 6,516. https://www.sanjoseca.gov/home/showpublisheddocument/75883/638411064623230000",
  },

  {
    id: "los-gatos-downtown-mixed-use",
    name: "Los Gatos Downtown Mixed-Use Development",
    city: "Los Gatos",
    cityId: "los-gatos",
    category: "mixed-use",
    status: "approved",
    description:
      "Los Gatos has approved several infill mixed-use projects in its downtown core, adding residential units above ground-floor retail on Santa Cruz Avenue and adjacent streets. These smaller-scale projects preserve the town's character while adding needed housing.",
    scale: "Multiple small parcels",
    developer: "Various",
    timeline: "Active development",
    featured: false,
    sourceNote: "Rollup of small downtown infill approvals along Santa Cruz Ave and adjacent streets, not one tracked development. Verify at losgatosca.gov planning records.",
  },

  {
    id: "santana-row-residential",
    name: "Santana Row Lot 12",
    city: "San José",
    cityId: "san-jose",
    category: "housing",
    status: "under-construction",
    description:
      "Federal Realty is constructing a six-story apartment building with 258 homes and parking on Lot 12 at Santana Row.",
    scale: "258 apartments in one six-story building",
    developer: "Federal Realty Investment Trust",
    timeline: "Construction underway as of November 2026",
    featured: false,
    sourceNote:
      "Federal Realty's Q3 2026 supplemental filing lists Lot 12, its unit count, and its scope: https://www.sec.gov/Archives/edgar/data/34903/000003490326000054/frt-9302026xex991.htm. The Q3 investor presentation lists the 258 homes as underway: https://ir.federalrealty.com/static-files/0e0ded08-ffb1-4cb9-bddd-02121c814dcc.",
  },

  {
    id: "wolfe-rd-housing-cupertino",
    name: "Wolfe Road Housing Development",
    city: "Cupertino",
    cityId: "cupertino",
    category: "housing",
    status: "approved",
    description:
      "Cupertino's Planning Commission voted 5–0 on November 10, 2026, to approve Eden Housing's site and tree removal permits for 251 homes at 10333 N. Wolfe Road. The plans call for 248 income-restricted homes, three manager units, trail improvements, and the removal and replacement of 117 protected trees.",
    scale: "251 homes, including 248 planned income-restricted units",
    developer: "Eden Housing (applicant)",
    timeline: "Planning Commission approved the permits November 10, 2026",
    featured: false,
    sourceNote:
      "Cupertino Planning Commission item 2, file 26-15432. The city-posted November 10 transcript records the 5–0 vote at 1:50:02. The staff report gives the 248 income-restricted homes and three manager units. https://cupertino.legistar.com/MeetingDetail.aspx?GUID=5D8BA424-C1E8-42B2-8B92-4F9B2D819E8E&ID=1360740",
  },

  // ── PROPOSED ────────────────────────────────────────────────────────────

  {
    id: "downtown-sunnyvale",
    name: "Downtown Sunnyvale Revitalization",
    city: "Sunnyvale",
    cityId: "sunnyvale",
    category: "mixed-use",
    status: "proposed",
    description:
      "Sunnyvale is pursuing multiple mixed-use redevelopment proposals along Murphy Avenue and the Mathilda corridor to create a more vibrant downtown. Plans include ground-floor retail with residential above, streetscape improvements, and better connections to the Sunnyvale Caltrain station.",
    scale: "Multiple parcels",
    developer: "City of Sunnyvale + private developers",
    timeline: "In planning",
    featured: false,
    sourceNote: "Rollup of the Downtown Specific Plan area's separate Murphy Ave / Mathilda proposals, not one tracked development — individual blocks are at different stages and some have already delivered, so the single \"proposed\" status is a summary. Verify parcel-level status at sunnyvale.ca.gov downtown planning records.",
  },

  // ── COMPLETED ───────────────────────────────────────────────────────────

  {
    id: "caltrain-electrification",
    name: "Caltrain Electrification",
    city: "Regional (San José to SF)",
    cityId: "san-jose",
    category: "transit",
    status: "completed",
    description:
      "After years of construction, Caltrain completed its electrification project and launched electric train service in late 2024. The new Stadler-built electric trains replaced diesel locomotives on the Peninsula corridor, cutting travel times, reducing emissions, and significantly increasing capacity.",
    scale: "51-mile electrified corridor",
    developer: "Peninsula Corridor Joint Powers Board",
    timeline: "Completed 2024",
    featured: true,
  },

  {
    id: "google-bay-view",
    name: "Google Bay View Campus",
    city: "Mountain View",
    cityId: "mountain-view",
    category: "tech-campus",
    status: "completed",
    description:
      "Google opened its Bay View campus at NASA Research Park in Mountain View in 2022. Designed with Heatherwick Studio and BIG, the all-electric campus has a dragonscale solar roof, geothermal heating and cooling, and indoor garden courts.",
    scale: "1.1M sq ft",
    developer: "Google",
    timeline: "Completed 2022",
    featured: true,
    sourceNote:
      "Google's opening announcement documents the solar roof and geothermal system: https://blog.google/company-news/inside-google/life-at-google/bay-view-campus-grand-opening/. Google Real Estate gives the campus size: https://realestate.withgoogle.com/bayview/.",
  },

  {
    id: "nvidia-voyager",
    name: "NVIDIA West Campus",
    city: "Santa Clara",
    cityId: "santa-clara",
    category: "tech-campus",
    status: "completed",
    description:
      "Gensler designed the Endeavor and Voyager buildings at NVIDIA's Santa Clara headquarters. The two buildings make up the West Campus. Voyager, the second phase, accounts for 750,000 square feet.",
    scale: "1.25M sq ft across Endeavor and Voyager",
    developer: "NVIDIA",
    timeline: "Endeavor completed in 2017 and Voyager in 2022",
    featured: true,
    sourceNote:
      "NVIDIA's visitor map identifies the West Campus buildings: https://www.nvidia.com/content/dam/en-zz/Solutions/support/corp-facilities-visitor-map-2022.pdf. The development manager gives the sizes and completion years: https://www.srgnc.com/nvidia.",
  },

];

// ── Pulse stats ─────────────────────────────────────────────────────────────

export const DEV_PULSE = [
  {
    value: DEV_PROJECTS.filter((p) => p.status === "under-construction").length.toString(),
    label: "Under Construction",
    note: "Active major projects",
  },
  {
    value: DEV_PROJECTS.filter((p) => p.status === "approved").length.toString(),
    label: "Approved",
    note: "Permitted, not yet built",
  },
  {
    value: DEV_PROJECTS.filter((p) => p.status === "completed").length.toString(),
    label: "Recently Completed",
    note: "Finished in past 5 years",
  },
  {
    value: DEV_PROJECTS.filter((p) => p.featured).length.toString(),
    label: "Signature Projects",
    note: "Generational developments",
  },
];
