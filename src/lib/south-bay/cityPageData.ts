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

export type CityPageData = {
  nextMeeting: CityMeeting | null;
  digest: CityDigest | null;
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

// ── Entry points ──

export function getCityPageData(cityId: string, _cityName: string): CityPageData {
  return {
    nextMeeting: meetingFor(cityId),
    digest: digestFor(cityId),
    campLastDates: openCampLastDatesForCity(cityId),
  };
}

export function getOpenNowCandidates(cityId: string): OpenNowCandidate[] {
  const byCity = (openNowCandidatesJson as unknown as { cities?: Record<string, RawOpenNowCandidate[]> }).cities ?? {};
  return selectOpenNowCandidates(byCity, cityId);
}
