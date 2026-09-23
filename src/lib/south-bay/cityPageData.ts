// ---------------------------------------------------------------------------
// South Bay Today — per-city data for /city/<slug>
// ---------------------------------------------------------------------------
// CityPage is a client:load island, so everything it imports ships to the
// browser. It used to import the all-city JSON files directly, which put every
// city's data on every city page (open-now-candidates.json alone was ~340 KB
// of CityPage's chunk). Now each page gets only its own city's slice, trimmed
// to the fields CityPage renders:
//   - getCityPageData(): what the server render needs, passed as island props
//     by src/pages/city/[slug].astro.
//   - getOpenNowCandidates(): the "Open Right Now" pool, served as
//     /city/<slug>/open-now.json and fetched after mount (see that endpoint).
// CityPage imports types from this module, never values.
//
// Keep this module deterministic: it runs once at build time, and its output
// feeds the server render, the hydration props, and the open-now endpoint.
// Anything that depends on the reader's clock or on randomness (is the
// meeting tonight, which places are open now, which camps are still running)
// stays in CityPage and runs after mount.

import upcomingMeetingsJson from "../../data/south-bay/upcoming-meetings.json";
import digestsJson from "../../data/south-bay/digests.json";
import redditPulseJson from "../../data/south-bay/reddit-pulse.json";
import openNowCandidatesJson from "../../data/south-bay/open-now-candidates.json";
import { isPlaceTemporarilyUnavailable } from "./placeAvailability.mjs";
import { openCampLastDatesForCity } from "./cityCamps";

// ── Types (what CityPage receives) ──

export type AgendaItem = { title: string; sequence: number };

/** The city's next scheduled meeting (upcoming-meetings.json). */
export type CityMeeting = {
  date: string;
  displayDate: string | null;
  bodyName: string;
  url: string | null;
  agendaItems: AgendaItem[];
};

/** The city's last summarized meeting (digests.json). */
export type CityDigest = {
  meetingDate: string;
  meetingDateIso: string | null;
  summary: string;
};

/** A top-rated place from open-now-candidates.json. */
export type OpenNowCandidate = {
  id: string;
  name: string;
  displayType: string | null;
  category: string | null;
  rating: number;
  ratingCount: number;
  hours: Record<string, string | undefined>;
  mapsUrl: string | null;
  url: string | null;
  photoRef: string | null;
};

export type RedditTile = {
  id: string;
  sub: string;
  title: string;
  image: string;
  score: number;
  numComments: number;
  ageHours: number;
  permalink: string;
};

export type CityReddit = {
  tiles: RedditTile[];
  /** The local subreddit to credit in the subtitle, when one of its posts made the grid. */
  localSub: string | null;
};

export type CityPageData = {
  nextMeeting: CityMeeting | null;
  digest: CityDigest | null;
  reddit: CityReddit | null;
  /** See openCampLastDatesForCity: one entry per camp still open at build time. */
  campLastDates: Array<string | null>;
};

// ── Raw file shapes (only the fields read here) ──

type RawMeeting = {
  date: string;
  displayDate?: string | null;
  bodyName: string;
  url?: string | null;
  agendaItems?: AgendaItem[];
};

type RawDigest = {
  meetingDate?: string;
  meetingDateIso?: string | null;
  summary?: string | null;
};

export type RawOpenNowCandidate = {
  id: string;
  name: string;
  displayType?: string | null;
  category?: string | null;
  rating: number;
  ratingCount: number;
  priceLevel?: number | null;
  hours: Record<string, string | undefined>;
  mapsUrl?: string | null;
  url?: string | null;
  photoRef?: string | null;
};

export type RawRedditPost = {
  id: string;
  sub: string;
  title: string;
  displayTitle?: string;
  summary?: string;
  image?: string | null;
  score: number;
  numComments: number;
  ageHours: number;
  permalink: string;
};

// ── Meeting + digest ──

function meetingFor(cityId: string): CityMeeting | null {
  const m = (upcomingMeetingsJson as unknown as { meetings?: Record<string, RawMeeting> }).meetings?.[cityId];
  if (!m) return null;
  return {
    date: m.date,
    displayDate: m.displayDate ?? null,
    bodyName: m.bodyName,
    url: m.url ?? null,
    agendaItems: m.agendaItems ?? [],
  };
}

function digestFor(cityId: string): CityDigest | null {
  const d = (digestsJson as unknown as Record<string, RawDigest | undefined>)[cityId];
  // CityHallPanel only shows a digest that has a summary.
  if (!d?.summary) return null;
  return {
    meetingDate: d.meetingDate ?? "",
    meetingDateIso: d.meetingDateIso ?? null,
    summary: d.summary,
  };
}

// ── Open Right Now candidates ──

/** The city's candidates minus editorially unavailable places, trimmed to the
 *  fields CityOpenNow reads. The open-at-this-minute filter and the shuffle
 *  depend on the reader's clock, so CityOpenNow does those after mount. */
export function selectOpenNowCandidates(
  byCity: Record<string, RawOpenNowCandidate[] | undefined>,
  cityId: string,
): OpenNowCandidate[] {
  return (byCity[cityId] ?? [])
    .filter((place) => !isPlaceTemporarilyUnavailable(place))
    .map((p) => ({
      id: p.id,
      name: p.name,
      displayType: p.displayType ?? null,
      category: p.category ?? null,
      rating: p.rating,
      ratingCount: p.ratingCount,
      hours: p.hours,
      mapsUrl: p.mapsUrl ?? null,
      url: p.url ?? null,
      photoRef: p.photoRef ?? null,
    }));
}

// ── The Conversation (Reddit tiles) ──
//
// Filter rule: local subs first, then regional subs that mention the city by
// name, then bare regional posts to keep the grid full when local subs are
// sparse. Newest first within each tier.

// City id → subreddit names that count as "the local sub" for this city.
// Case-insensitive match; canonical spellings the data uses.
const CITY_SUBREDDITS: Record<string, string[]> = {
  "san-jose":      ["SanJose"],
  "palo-alto":     ["PaloAlto"],
  "mountain-view": ["mountainview", "MountainView"],
  "sunnyvale":     ["Sunnyvale"],
  "santa-clara":   ["SantaClara"],
  "cupertino":     ["Cupertino"],
  "saratoga":      ["Saratoga_CA"],
  "los-gatos":     ["losgatos"],
  "milpitas":      ["Milpitas"],
  "campbell":      ["campbell", "Campbell"],
};

const REGIONAL_SUBS = new Set(["bayarea", "AskSF", "siliconvalley"]);

// Take up to 8 tiles. Smaller datasets (Los Gatos, Saratoga) ship whatever
// they have so long as there are at least 2 candidates — a single tile reads
// as broken, but 2-3 is fine in a 2-col mobile layout, and the desktop
// 4-col grid just auto-flows with empty trailing cells.
const TILE_TARGET = 8;

export function selectRedditTiles(posts: RawRedditPost[], cityId: string, cityName: string): CityReddit | null {
  const localSubs = (CITY_SUBREDDITS[cityId] ?? []).map((s) => s.toLowerCase());
  const cityNeedle = cityName.toLowerCase();

  const ranked = posts
    .filter((p) => !!p.image)
    .map((p) => {
      const subLower = (p.sub || "").toLowerCase();
      const isLocal = localSubs.includes(subLower);
      const isRegional = REGIONAL_SUBS.has(p.sub);
      const hay = `${p.title || ""} ${p.summary || ""}`.toLowerCase();
      const cityMention = hay.includes(cityNeedle);
      let rank = 99;
      if (isLocal) rank = 0;
      else if (isRegional && cityMention) rank = 1;
      else if (isRegional) rank = 2;
      return { post: p, rank };
    })
    .filter((x) => x.rank <= 2)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.post.ageHours - b.post.ageHours;
    })
    .slice(0, TILE_TARGET);

  if (ranked.length < 2) return null;

  return {
    tiles: ranked.map(({ post: p }) => ({
      id: p.id,
      sub: p.sub,
      title: p.displayTitle || p.title,
      image: p.image as string,
      score: p.score,
      numComments: p.numComments,
      ageHours: p.ageHours,
      permalink: p.permalink,
    })),
    // Only credit r/<localsub> when one of its posts is actually showing.
    localSub: ranked.some((x) => x.rank === 0) ? (CITY_SUBREDDITS[cityId] ?? [])[0] ?? null : null,
  };
}

// ── Entry points ──

export function getCityPageData(cityId: string, cityName: string): CityPageData {
  const redditPosts = (redditPulseJson as unknown as { posts?: RawRedditPost[] }).posts ?? [];
  return {
    nextMeeting: meetingFor(cityId),
    digest: digestFor(cityId),
    reddit: selectRedditTiles(redditPosts, cityId, cityName),
    campLastDates: openCampLastDatesForCity(cityId),
  };
}

export function getOpenNowCandidates(cityId: string): OpenNowCandidate[] {
  const byCity = (openNowCandidatesJson as unknown as { cities?: Record<string, RawOpenNowCandidate[]> }).cities ?? {};
  return selectOpenNowCandidates(byCity, cityId);
}
