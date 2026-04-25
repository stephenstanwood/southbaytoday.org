// 2026 South Bay & California elections — June 2 primary.
//
// Curated for the South Bay (Santa Clara County) audience: only races on the
// June primary ballot, in the order most relevant to local readers.
//
// US Senate is NOT on the 2026 ballot — Padilla next runs 2028, Schiff 2030.
// State Senate seats covering the South Bay (SD 13, SD 15) are odd-numbered
// and also not on the 2026 ballot.

export type Party = "D" | "R" | "NPP" | "NP";

export interface Candidate {
  name: string;
  party: Party;
  note?: string;
  incumbent?: boolean;
}

export interface Race {
  id: string;
  emoji: string;
  race: string;
  scope: "statewide" | "countywide" | "district" | "city";
  summary: string;
  candidates: Candidate[];
  infoUrl: string;
  unopposed?: boolean;
}

// Governor field as of late April 2026 (Emerson poll, post-Swalwell exit).
// Not a static list of every filer — only candidates polling 3%+ or with
// significant name recognition. Polling shifts; refresh occasionally.
export const GOV_POLLING_NOTE =
  "Emerson April poll: Hilton (R) 17, Bianco (R) 14, Steyer (D) 14, Becerra (D) 10, Porter (D) 10, Mahan (D) 5 — 23% undecided.";

export const RACES: Race[] = [
  {
    id: "ca-governor",
    emoji: "🏛️",
    race: "California Governor",
    scope: "statewide",
    summary: "Open seat — Newsom term-limited. Crowded Dem field; risk both top-two slots go Republican.",
    candidates: [
      { name: "Steve Hilton",          party: "R", note: "Fox News contributor; leads polling" },
      { name: "Chad Bianco",           party: "R", note: "Riverside County Sheriff" },
      { name: "Tom Steyer",            party: "D", note: "billionaire, 2020 presidential candidate" },
      { name: "Xavier Becerra",        party: "D", note: "former US HHS Secretary; surged in April" },
      { name: "Katie Porter",          party: "D", note: "former US Rep, Orange County" },
      { name: "Antonio Villaraigosa",  party: "D", note: "former LA Mayor" },
      { name: "Tony Thurmond",         party: "D", note: "State Superintendent of Public Instruction" },
      { name: "Matt Mahan",            party: "D", note: "San José Mayor — local candidate" },
    ],
    infoUrl: "https://ballotpedia.org/California_gubernatorial_election,_2026",
  },
  {
    id: "scc-da",
    emoji: "⚖️",
    race: "Santa Clara County DA",
    scope: "countywide",
    summary: "Rosen seeks 5th term against a deputy DA from his own office — 2022 rematch.",
    candidates: [
      { name: "Jeff Rosen",   party: "NP", note: "incumbent since 2010", incumbent: true },
      { name: "Daniel Chung", party: "NP", note: "Deputy DA; lost to Rosen in 2022" },
    ],
    infoUrl: "https://sanjosespotlight.com/only-two-santa-clara-county-races-are-competitive/",
  },
  {
    id: "scc-sup-d1",
    emoji: "🗳️",
    race: "SCC Supervisor — District 1",
    scope: "district",
    summary: "South County: Morgan Hill, Gilroy, southern San Jose / Evergreen.",
    candidates: [
      { name: "Sylvia Arenas",  party: "NP", note: "incumbent (D), first elected 2022", incumbent: true },
      { name: "Rebecca Munson", party: "NP", note: "Morgan Hill Unified school board" },
    ],
    infoUrl: "https://ballotpedia.org/Santa_Clara_County,_California,_elections,_2026",
  },
  {
    id: "scc-sup-d4",
    emoji: "🗳️",
    race: "SCC Supervisor — District 4",
    scope: "district",
    summary: "Campbell, Santa Clara, western San Jose. Incumbent unopposed — no June contest.",
    candidates: [
      { name: "Susan Ellenberg", party: "NP", note: "incumbent (D), unopposed", incumbent: true },
    ],
    infoUrl: "https://ballotpedia.org/Santa_Clara_County,_California,_elections,_2026",
    unopposed: true,
  },
  {
    id: "ad-23",
    emoji: "📋",
    race: "State Assembly — District 23",
    scope: "district",
    summary: "Palo Alto, Mountain View, Los Altos, Campbell, Saratoga, southern San Mateo Co.",
    candidates: [
      { name: "Marc Berman",     party: "D", note: "incumbent since 2016", incumbent: true },
      { name: "Rick Giorgetti",  party: "R", note: "businessman" },
      { name: "David Johnson",   party: "R", note: "Santa Clara County GOP chair" },
    ],
    infoUrl: "https://ballotpedia.org/California's_23rd_State_Assembly_district",
  },
  {
    id: "ad-26",
    emoji: "📋",
    race: "State Assembly — District 26",
    scope: "district",
    summary: "Cupertino, Sunnyvale, Santa Clara, west San Jose.",
    candidates: [
      { name: "Patrick Ahrens",     party: "D", note: "incumbent (first elected 2024)", incumbent: true },
      { name: "Tim Gorsulowsky",    party: "R", note: "small business owner" },
    ],
    infoUrl: "https://ballotpedia.org/Patrick_Ahrens",
  },
  {
    id: "ad-28",
    emoji: "📋",
    race: "State Assembly — District 28",
    scope: "district",
    summary: "Los Gatos, Monte Sereno, Morgan Hill, parts of San Jose + Santa Cruz County.",
    candidates: [
      { name: "Gail Pellerin", party: "D", note: "incumbent; former SCZ County clerk", incumbent: true },
      { name: "Liz Lawler",    party: "R", note: "former Monte Sereno mayor; lost 2024 67–33" },
    ],
    infoUrl: "https://ballotpedia.org/Gail_Pellerin",
  },
  {
    id: "ad-24",
    emoji: "📋",
    race: "State Assembly — District 24",
    scope: "district",
    summary: "Milpitas, parts of San Jose, Fremont, Newark.",
    candidates: [
      { name: "Alex Lee",  party: "D",   note: "incumbent since 2020", incumbent: true },
      { name: "Max Hsia",  party: "R" },
      { name: "Yang Shao", party: "NPP", note: "no party preference" },
    ],
    infoUrl: "https://ballotpedia.org/Alex_Lee",
  },
  {
    id: "ad-25",
    emoji: "📋",
    race: "State Assembly — District 25",
    scope: "district",
    summary: "Most of San Jose. Kalra running for sixth and final term; no major challenger.",
    candidates: [
      { name: "Ash Kalra", party: "D", note: "incumbent since 2016", incumbent: true },
    ],
    infoUrl: "https://ballotpedia.org/Ash_Kalra",
    unopposed: true,
  },
  {
    id: "sj-council",
    emoji: "🏙️",
    race: "San José City Council",
    scope: "city",
    summary: "Five district seats on the June primary: D1, D3, D5, D7, D9. D9 open (Foley termed out). Top two advance to November runoff if no majority.",
    candidates: [],
    infoUrl: "https://www.sanjoseca.gov/your-government/appointees/city-clerk/elections/2026-elections-primary-and-runoff",
  },
];

export const PARTY_COLOR: Record<Party, { bg: string; fg: string }> = {
  D:   { bg: "#dbeafe", fg: "#1d4ed8" },
  R:   { bg: "#fee2e2", fg: "#b91c1c" },
  NP:  { bg: "#f3f4f6", fg: "#4b5563" },
  NPP: { bg: "#ede9fe", fg: "#7c3aed" },
};
