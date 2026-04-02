export const prerender = false;
import type { APIRoute } from "astro";
import { okJson, errJson } from "../../../lib/apiHelpers";
import { rateLimit, rateLimitResponse } from "../../../lib/rateLimit";

/**
 * AHL Barracuda scores proxy.
 * HockeyTech requires an API key, so we derive scheduled games from the
 * pre-built Ticketmaster events data (updated on each deploy).
 * Returns upcoming + recent Barracuda games in AhlApiGame format.
 */

// AHL team name → abbreviation
const AHL_ABBR: Record<string, string> = {
  "San Jose Barracuda":          "SJ",
  "Colorado Eagles":             "COL",
  "San Diego Gulls":             "SD",
  "Coachella Valley Firebirds":  "CV",
  "Bakersfield Condors":         "BAK",
  "Ontario Reign":               "ONT",
  "Henderson Silver Knights":    "HSK",
  "Tucson Roadrunners":          "TUC",
  "Abbotsford Canucks":          "ABB",
  "Calgary Wranglers":           "CGY",
  "Stockton Heat":               "STK",
  "Texas Stars":                 "TEX",
  "Milwaukee Admirals":          "MIL",
  "Chicago Wolves":              "CHI",
  "Grand Rapids Griffins":       "GR",
  "Cleveland Monsters":          "CLE",
  "Rochester Americans":         "ROC",
  "Syracuse Crunch":             "SYR",
  "Utica Comets":                "UTI",
  "Bridgeport Islanders":        "BRI",
  "Providence Bruins":           "PRO",
  "Springfield Thunderbirds":    "SPR",
  "Hartford Wolf Pack":          "HFD",
  "Charlotte Checkers":          "CHA",
  "Lehigh Valley Phantoms":      "LHV",
  "Hershey Bears":               "HER",
  "Wilkes-Barre/Scranton Penguins": "WBS",
  "Belleville Senators":         "BEL",
  "Manitoba Moose":              "MB",
  "Iowa Wild":                   "IA",
  "Rockford IceHogs":            "RFD",
};

function abbr(name: string): string {
  if (AHL_ABBR[name]) return AHL_ABBR[name];
  // fallback: initials of last word
  const words = name.split(" ");
  return words[words.length - 1].slice(0, 3).toUpperCase();
}

/** Parse "7:00 PM" + date → ISO UTC string (Pacific time assumed) */
function toIso(date: string, time: string | null): string {
  if (!time) return `${date}T03:00:00.000Z`; // default 7pm PT
  const m = time.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return `${date}T03:00:00.000Z`;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  // April = PDT = UTC-7
  const utcH = (h + 7) % 24;
  const dayOffset = h + 7 >= 24 ? 1 : 0;
  const d = new Date(`${date}T00:00:00-07:00`);
  d.setDate(d.getDate() + dayOffset);
  d.setUTCHours(utcH, min, 0, 0);
  return d.toISOString();
}

export const GET: APIRoute = async ({ request, clientAddress }) => {
  if (!rateLimit(clientAddress)) return rateLimitResponse();

  const url = new URL(request.url);
  const daysBack = Math.min(Math.max(parseInt(url.searchParams.get("days_back") ?? "4", 10), 0), 14);
  const daysFwd  = Math.min(Math.max(parseInt(url.searchParams.get("days_forward") ?? "4", 10), 0), 30);

  const now = new Date();
  const nowPt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const todayPt = nowPt.toISOString().split("T")[0];
  const start = new Date(nowPt); start.setDate(nowPt.getDate() - daysBack);
  const end   = new Date(nowPt); end.setDate(nowPt.getDate() + daysFwd);
  const startIso = start.toISOString().split("T")[0];
  const endIso   = end.toISOString().split("T")[0];

  // Dynamically import the pre-built events JSON (bundled at deploy time).
  let allEvents: Array<{
    id: string; title: string; date: string; time: string | null;
    category: string; ongoing?: boolean; source?: string;
  }>;
  try {
    const mod = await import("../../../data/south-bay/upcoming-events.json");
    allEvents = (mod.default as { events: typeof allEvents }).events ?? [];
  } catch {
    return errJson("events data unavailable", 503);
  }

  const games = allEvents
    .filter((e) => {
      if (e.ongoing || e.category !== "sports") return false;
      if (e.date < startIso || e.date > endIso) return false;
      const t = e.title ?? "";
      return t.includes("Barracuda");
    })
    .map((e) => {
      const t = e.title ?? "";
      // "San Jose Barracuda vs. Colorado Eagles" → home=Barracuda, away=Eagles
      const vsMatch = t.match(/^San Jose Barracuda vs\.\s+(.+)$/i);
      const atMatch = t.match(/^(.+?)\s+vs\.\s+San Jose Barracuda/i);
      const isSBHome = !!vsMatch;
      const homeTeam = isSBHome ? "San Jose Barracuda" : (atMatch ? atMatch[1].trim() : "Unknown");
      const awayTeam = isSBHome ? (vsMatch ? vsMatch[1].trim() : "Unknown") : "San Jose Barracuda";

      const isoTime = toIso(e.date, e.time);
      const gameMs = new Date(isoTime).getTime();
      const nowMs  = now.getTime();
      // Pre: >15 min before start; post: >3h after start; else in
      let status: "pre" | "in" | "post" = "pre";
      if (nowMs >= gameMs + 3 * 60 * 60 * 1000) status = "post";
      else if (nowMs >= gameMs - 15 * 60 * 1000) status = "in";

      const statusDetail =
        status === "pre"
          ? new Date(isoTime).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            })
          : status === "in" ? "In Progress" : "Final";

      return {
        id: e.id,
        date: e.date,
        startTime: e.time ?? "",
        isoTime,
        homeTeam,
        homeAbbr: abbr(homeTeam),
        homeGoals: 0,
        awayTeam,
        awayAbbr: abbr(awayTeam),
        awayGoals: 0,
        status,
        statusDetail,
        isSouthBayHome: isSBHome,
      };
    });

  return okJson(
    { games },
    { "Cache-Control": "public, s-maxage=300, max-age=60" },
  );
};
