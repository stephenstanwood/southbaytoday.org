// ---------------------------------------------------------------------------
// South Bay Signal — team definitions + ESPN fetching
// ---------------------------------------------------------------------------

import type { SouthBayTeam, LeagueKey, ParsedGame } from "./types";
import { REFRESH_MS, TIMEZONE } from "../sportsCore";

// ── South Bay teams ──

export const SOUTH_BAY_TEAMS: SouthBayTeam[] = [
  // Primary — local teams
  {
    key: "sj-sharks",
    name: "San Jose Sharks",
    shortName: "Sharks",
    league: "nhl",
    espnPath: "hockey/nhl",
    abbreviation: "SJ",
    color: "#006D75",
    textColor: "#00AAB5",
    primary: true,
  },
  {
    key: "sj-earthquakes",
    name: "San Jose Earthquakes",
    shortName: "Earthquakes",
    league: "mls",
    espnPath: "soccer/usa.1",
    abbreviation: "SJ",
    color: "#0067B1",
    textColor: "#3399DD",
    primary: true,
  },
  {
    key: "sj-giants",
    name: "San Jose Giants",
    shortName: "SJ Giants",
    league: "milb",
    espnPath: "", // no ESPN coverage — uses MLB statsapi
    abbreviation: "SJ",
    color: "#FD5A1E",
    textColor: "#FF8844",
    primary: true,
  },
  // College — football + basketball
  {
    key: "stanford-fb",
    name: "Stanford Cardinal",
    shortName: "Stanford",
    league: "ncaaf",
    espnPath: "football/college-football",
    abbreviation: "STAN",
    color: "#8C1515",
    textColor: "#CC4444",
    primary: true,
  },
  {
    key: "stanford-mbb",
    name: "Stanford Cardinal",
    shortName: "Stanford",
    league: "ncaam",
    espnPath: "basketball/mens-college-basketball",
    abbreviation: "STAN",
    color: "#8C1515",
    textColor: "#CC4444",
    primary: true,
  },
  {
    key: "sjsu-fb",
    name: "San Jose State Spartans",
    shortName: "SJSU",
    league: "ncaaf",
    espnPath: "football/college-football",
    abbreviation: "SJSU",
    color: "#0055A2",
    textColor: "#3388DD",
    primary: true,
  },
  {
    key: "sjsu-mbb",
    name: "San Jose State Spartans",
    shortName: "SJSU",
    league: "ncaam",
    espnPath: "basketball/mens-college-basketball",
    abbreviation: "SJSU",
    color: "#0055A2",
    textColor: "#3388DD",
    primary: true,
  },

  // Secondary — Bay Area pro teams
  {
    key: "warriors",
    name: "Golden State Warriors",
    shortName: "Warriors",
    league: "nba",
    espnPath: "basketball/nba",
    abbreviation: "GS",
    color: "#1D428A",
    textColor: "#4477CC",
  },
  {
    key: "sf-giants",
    name: "San Francisco Giants",
    shortName: "SF Giants",
    league: "mlb",
    espnPath: "baseball/mlb",
    abbreviation: "SF",
    color: "#FD5A1E",
    textColor: "#FF8844",
  },
  {
    key: "49ers",
    name: "San Francisco 49ers",
    shortName: "49ers",
    league: "nfl",
    espnPath: "football/nfl",
    abbreviation: "SF",
    color: "#AA0000",
    textColor: "#EE3333",
  },
  {
    key: "gs-valkyries",
    name: "Golden State Valkyries",
    shortName: "Valkyries",
    league: "wnba",
    espnPath: "basketball/wnba",
    abbreviation: "GS",
    color: "#584E9B",
    textColor: "#8877CC",
  },
];

// ── League metadata ──

interface LeagueMeta {
  key: LeagueKey;
  label: string;
  espnPath: string;
  order: number; // display sort order
}

export const LEAGUE_META: Record<string, LeagueMeta> = {
  nhl: { key: "nhl", label: "NHL", espnPath: "hockey/nhl", order: 1 },
  nba: { key: "nba", label: "NBA", espnPath: "basketball/nba", order: 2 },
  wnba: { key: "wnba", label: "WNBA", espnPath: "basketball/wnba", order: 3 },
  mlb: { key: "mlb", label: "MLB", espnPath: "baseball/mlb", order: 4 },
  milb: { key: "milb", label: "MiLB", espnPath: "", order: 5 },
  mls: { key: "mls", label: "MLS", espnPath: "soccer/usa.1", order: 6 },
  nfl: { key: "nfl", label: "NFL", espnPath: "football/nfl", order: 7 },
  ncaaf: { key: "ncaaf", label: "College FB", espnPath: "football/college-football", order: 8 },
  ncaam: { key: "ncaam", label: "College BBall", espnPath: "basketball/mens-college-basketball", order: 9 },
};

// ── ESPN helpers ──

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

// Months (1-based) when each league is active — avoids fetching pointless off-season endpoints
const LEAGUE_ACTIVE_MONTHS: Partial<Record<LeagueKey, number[]>> = {
  // NFL: Sep(9) – Feb(2)
  nfl: [1, 2, 9, 10, 11, 12],
  // NCAAF: Sep(9) – Jan(1) + bowl games through Jan
  ncaaf: [1, 9, 10, 11, 12],
  // MLB: Mar(3) – Oct(10) (spring training through postseason)
  mlb: [3, 4, 5, 6, 7, 8, 9, 10],
  // MiLB: Apr(4) – Sep(9)
  milb: [4, 5, 6, 7, 8, 9],
  // MLS: Feb(2) – Nov(11)
  mls: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  // NHL: Oct(10) – Jun(6)
  nhl: [1, 2, 3, 4, 5, 6, 10, 11, 12],
  // NBA: Oct(10) – Jun(6)
  nba: [1, 2, 3, 4, 5, 6, 10, 11, 12],
  // WNBA: May(5) – Sep(9)
  wnba: [5, 6, 7, 8, 9],
  // NCAAM basketball: Nov(11) – Apr(4) (includes March Madness)
  ncaam: [1, 2, 3, 4, 11, 12],
};

/** Get unique ESPN paths we need to fetch, filtered to active seasons. */
export function getEspnPaths(): string[] {
  const currentMonth = new Date().getMonth() + 1; // 1-based
  const paths = new Set<string>();
  for (const team of SOUTH_BAY_TEAMS) {
    if (!team.espnPath) continue;
    const activeMonths = LEAGUE_ACTIVE_MONTHS[team.league];
    if (activeMonths && !activeMonths.includes(currentMonth)) continue;
    paths.add(team.espnPath);
  }
  return [...paths];
}

/** Build the full ESPN scoreboard URL for a league path. */
export function espnScoreboardUrl(leaguePath: string): string {
  return `${ESPN_BASE}/${leaguePath}/scoreboard`;
}

// ── MiLB Stats API helpers (for San Jose Giants) ──

const MILB_STATS_BASE = "https://statsapi.mlb.com/api/v1";
// San Jose Giants team ID in MLB's statsapi
const SJ_GIANTS_TEAM_ID = 476; // Verified via statsapi.mlb.com

export function milbScheduleUrl(teamId: number = SJ_GIANTS_TEAM_ID): string {
  const today = new Date().toISOString().split("T")[0];
  return `${MILB_STATS_BASE}/schedule?sportId=14&teamId=${teamId}&date=${today}`;
}

// ── Abbreviation lookup for matching ESPN data ──

const ABBR_TO_TEAM = new Map<string, SouthBayTeam>();
for (const team of SOUTH_BAY_TEAMS) {
  // Key by league+abbreviation to handle abbreviation collisions (SJ = Sharks and Earthquakes)
  ABBR_TO_TEAM.set(`${team.espnPath}:${team.abbreviation}`, team);
}

/** Check if a team abbreviation from ESPN data belongs to a South Bay team. */
export function findSouthBayTeam(
  espnPath: string,
  abbreviation: string,
): SouthBayTeam | undefined {
  return ABBR_TO_TEAM.get(`${espnPath}:${abbreviation}`);
}

/** College teams need special matching — ESPN uses different abbreviations. */
const COLLEGE_ALIASES: Record<string, string> = {
  STAN: "STAN",
  SJSU: "SJSU",
  SJS: "SJSU",
};

export function findCollegeTeam(abbreviation: string): SouthBayTeam | undefined {
  const normalized = COLLEGE_ALIASES[abbreviation] ?? abbreviation;
  return SOUTH_BAY_TEAMS.find(
    (t) =>
      (t.league === "ncaaf" || t.league === "ncaam") &&
      t.abbreviation === normalized,
  );
}

export { REFRESH_MS, TIMEZONE };
