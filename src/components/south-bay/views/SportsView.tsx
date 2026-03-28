import { useState, useEffect, useCallback, useRef } from "react";
import type { ParsedGame, LeagueKey } from "../../../lib/south-bay/types";
import {
  SOUTH_BAY_TEAMS,
  LEAGUE_META,
  getEspnPaths,
  espnScoreboardUrl,
  findSouthBayTeam,
  findCollegeTeam,
  milbScheduleUrl,
  REFRESH_MS,
} from "../../../lib/south-bay/teams";
import GameCard from "../cards/GameCard";

// ── ESPN data parsing ──

function parseEspnGames(espnPath: string, data: unknown): ParsedGame[] {
  const events = (data as { events?: unknown[] })?.events ?? [];
  const games: ParsedGame[] = [];

  for (const event of events) {
    const e = event as {
      id?: string;
      date?: string;
      competitions?: Array<{
        competitors?: Array<{
          homeAway?: string;
          score?: string;
          team?: {
            abbreviation?: string;
            displayName?: string;
            logo?: string;
            color?: string;
          };
          records?: Array<{ summary?: string }>;
        }>;
        status?: {
          type?: { state?: string; detail?: string; shortDetail?: string };
        };
        geoBroadcasts?: Array<{
          market?: { type?: string };
          media?: { shortName?: string };
        }>;
      }>;
    };

    const comp = e.competitions?.[0];
    if (!comp?.competitors || comp.competitors.length < 2) continue;

    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const homeAbbr = home.team?.abbreviation ?? "";
    const awayAbbr = away.team?.abbreviation ?? "";

    // Check if either team is a South Bay team
    const isCollege =
      espnPath.includes("college-football") ||
      espnPath.includes("college-basketball");

    let sbTeam = isCollege
      ? findCollegeTeam(homeAbbr) ?? findCollegeTeam(awayAbbr)
      : findSouthBayTeam(espnPath, homeAbbr) ??
        findSouthBayTeam(espnPath, awayAbbr);

    if (!sbTeam) continue; // skip games without a south bay team

    // Determine league key from the team
    const leagueKey = sbTeam.league;
    const meta = LEAGUE_META[leagueKey];

    const state = comp.status?.type?.state ?? "pre";
    const broadcasts = (comp.geoBroadcasts ?? [])
      .filter((b) => b.market?.type === "National")
      .map((b) => b.media?.shortName)
      .filter(Boolean) as string[];

    const isSBHome =
      (isCollege ? findCollegeTeam(homeAbbr) : findSouthBayTeam(espnPath, homeAbbr)) != null;

    games.push({
      id: e.id ?? `${homeAbbr}-${awayAbbr}`,
      league: leagueKey,
      leagueLabel: meta?.label ?? leagueKey.toUpperCase(),
      homeTeam: home.team?.displayName ?? homeAbbr,
      awayTeam: away.team?.displayName ?? awayAbbr,
      homeLogo: home.team?.logo,
      awayLogo: away.team?.logo,
      homeAbbr,
      awayAbbr,
      homeScore: home.score != null ? Number(home.score) : undefined,
      awayScore: away.score != null ? Number(away.score) : undefined,
      homeRecord: home.records?.[0]?.summary,
      awayRecord: away.records?.[0]?.summary,
      homeColor: home.team?.color ? `#${home.team.color}` : "#888",
      awayColor: away.team?.color ? `#${away.team.color}` : "#888",
      status: state as "pre" | "in" | "post",
      statusDetail: comp.status?.type?.shortDetail ?? comp.status?.type?.detail ?? "",
      startTime: e.date ?? "",
      broadcasts,
      isSouthBayHome: isSBHome,
      southBayTeamKey: sbTeam.key,
    });
  }

  return games;
}

// ── MiLB Stats API parsing (San Jose Giants) ──

function parseMilbGames(data: unknown): ParsedGame[] {
  const dates = (data as { dates?: unknown[] })?.dates ?? [];
  const games: ParsedGame[] = [];
  const sjTeam = SOUTH_BAY_TEAMS.find((t) => t.key === "sj-giants");
  if (!sjTeam) return games;

  for (const dateEntry of dates) {
    const dayGames =
      (dateEntry as { games?: unknown[] })?.games ?? [];
    for (const g of dayGames) {
      const game = g as {
        gamePk?: number;
        gameDate?: string;
        status?: { detailedState?: string; abstractGameState?: string };
        teams?: {
          home?: {
            team?: { name?: string; abbreviation?: string };
            score?: number;
            leagueRecord?: { wins?: number; losses?: number };
          };
          away?: {
            team?: { name?: string; abbreviation?: string };
            score?: number;
            leagueRecord?: { wins?: number; losses?: number };
          };
        };
      };

      const home = game.teams?.home;
      const away = game.teams?.away;
      if (!home?.team || !away?.team) continue;

      const abstractState = game.status?.abstractGameState ?? "Preview";
      const status: "pre" | "in" | "post" =
        abstractState === "Live"
          ? "in"
          : abstractState === "Final"
            ? "post"
            : "pre";

      const homeRec = home.leagueRecord;
      const awayRec = away.leagueRecord;
      const isHome =
        home.team.abbreviation === "SJ" ||
        (home.team.name?.includes("San Jose") ?? false);

      games.push({
        id: `milb-${game.gamePk ?? Math.random()}`,
        league: "milb",
        leagueLabel: "MiLB",
        homeTeam: home.team.name ?? "Home",
        awayTeam: away.team.name ?? "Away",
        homeAbbr: home.team.abbreviation ?? "",
        awayAbbr: away.team.abbreviation ?? "",
        homeScore: home.score,
        awayScore: away.score,
        homeRecord:
          homeRec ? `${homeRec.wins}-${homeRec.losses}` : undefined,
        awayRecord:
          awayRec ? `${awayRec.wins}-${awayRec.losses}` : undefined,
        homeColor: isHome ? sjTeam.color : "#888",
        awayColor: !isHome ? sjTeam.color : "#888",
        status,
        statusDetail: game.status?.detailedState ?? "",
        startTime: game.gameDate ?? "",
        broadcasts: [],
        isSouthBayHome: isHome,
        southBayTeamKey: "sj-giants",
      });
    }
  }

  return games;
}

// ── Component ──

export default function SportsView() {
  const [games, setGames] = useState<ParsedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAllScores = useCallback(async () => {
    try {
      const paths = getEspnPaths();
      const results = await Promise.allSettled(
        paths.map(async (path) => {
          const res = await fetch(espnScoreboardUrl(path));
          if (!res.ok) throw new Error(`ESPN ${path}: ${res.status}`);
          const data = await res.json();
          return parseEspnGames(path, data);
        }),
      );

      // Also fetch MiLB (San Jose Giants) from MLB Stats API
      let milbGames: ParsedGame[] = [];
      try {
        const milbRes = await fetch(milbScheduleUrl());
        if (milbRes.ok) {
          const milbData = await milbRes.json();
          milbGames = parseMilbGames(milbData);
        }
      } catch {
        // MiLB fetch is best-effort — don't block on failure
      }

      const allGames: ParsedGame[] = [...milbGames];
      for (const result of results) {
        if (result.status === "fulfilled") {
          allGames.push(...result.value);
        }
      }

      // Sort: live first, then upcoming, then final
      const statusOrder: Record<string, number> = { in: 0, pre: 1, post: 2 };
      allGames.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 1;
        const sb = statusOrder[b.status] ?? 1;
        if (sa !== sb) return sa - sb;
        // Within same status, sort by league order, then time
        const la = LEAGUE_META[a.league]?.order ?? 99;
        const lb = LEAGUE_META[b.league]?.order ?? 99;
        if (la !== lb) return la - lb;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });

      setGames(allGames);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllScores();
    intervalRef.current = setInterval(() => {
      if (!document.hidden) fetchAllScores();
    }, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAllScores]);

  if (loading) {
    return (
      <div className="sb-loading">
        <div className="sb-spinner" />
        <div className="sb-loading-text">Loading scores...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sb-empty">
        <div className="sb-empty-title">Could not load scores</div>
        <div className="sb-empty-sub">{error}</div>
        <button
          onClick={() => {
            setLoading(true);
            fetchAllScores();
          }}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            background: "var(--sb-primary)",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="sb-empty">
        <div className="sb-empty-title">No games today</div>
        <div className="sb-empty-sub">
          Check back when your teams are playing
        </div>
      </div>
    );
  }

  // Group games by league
  const grouped = new Map<LeagueKey, ParsedGame[]>();
  for (const game of games) {
    const list = grouped.get(game.league) ?? [];
    list.push(game);
    grouped.set(game.league, list);
  }

  // Sort league groups by LEAGUE_META order
  const sortedLeagues = [...grouped.entries()].sort(
    ([a], [b]) =>
      (LEAGUE_META[a]?.order ?? 99) - (LEAGUE_META[b]?.order ?? 99),
  );

  const liveCount = games.filter((g) => g.status === "in").length;

  return (
    <>
      <div className="sb-section-header">
        <span className="sb-section-title">
          Scoreboard
          {liveCount > 0 && (
            <span style={{ color: "var(--sb-live)", marginLeft: 8 }}>
              {liveCount} live
            </span>
          )}
        </span>
        <div className="sb-section-line" />
      </div>

      {sortedLeagues.map(([league, leagueGames]) => (
        <div key={league} className="sb-league-group">
          <div className="sb-league-label">
            {LEAGUE_META[league]?.label ?? league}
          </div>
          <div className="sb-games-grid">
            {leagueGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
