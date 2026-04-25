import { useState, useCallback, useMemo } from "react";
import type { DigestData } from "../cards/DigestCard";
import CouncilDigestTurnstile from "../cards/CouncilDigestTurnstile";
import MinutesSearchCard from "../cards/MinutesSearchCard";
import ElectionsCard from "../cards/ElectionsCard";
import DevelopmentView from "./DevelopmentView";
import type { City } from "../../../lib/south-bay/types";
import digestsJson from "../../../data/south-bay/digests.json";
import upcomingMeetingsJson from "../../../data/south-bay/upcoming-meetings.json";

interface Props {
  selectedCities: Set<City>;
}

interface AgendaItem {
  title: string;
  sequence: number;
}

interface UpcomingMeeting {
  date: string;
  displayDate: string;
  bodyName: string;
  location: string | null;
  url: string;
  agendaItems?: AgendaItem[];
}

const staticDigests = digestsJson as Record<string, DigestData>;
const upcomingMeetings = (upcomingMeetingsJson as { meetings: Record<string, UpcomingMeeting> }).meetings;

// Canonical city order in the turnstile when "all" are selected. San José leads
// (largest by population), then a rough north-to-south sweep.
const CITY_ORDER: City[] = [
  "san-jose",
  "santa-clara",
  "sunnyvale",
  "mountain-view",
  "palo-alto",
  "los-altos",
  "cupertino",
  "campbell",
  "saratoga",
  "los-gatos",
  "milpitas",
];

const AGENDA_URLS: Record<string, string> = {
  "campbell": "https://www.campbellca.gov/AgendaCenter/City-Council-10",
  "saratoga": "https://saratoga-ca.municodemeetings.com/",
  "los-altos": "https://losaltos-ca.municodemeetings.com/",
  "los-gatos": "https://losgatos-ca.municodemeetings.com/",
  "san-jose": "https://sanjose.legistar.com/Calendar.aspx",
  "mountain-view": "https://mountainview.legistar.com/Calendar.aspx",
  "sunnyvale": "https://sunnyvale.legistar.com/Calendar.aspx",
  "cupertino": "https://cupertino.legistar.com/Calendar.aspx",
  "santa-clara": "https://santaclara.legistar.com/Calendar.aspx",
  "milpitas": "https://www.ci.milpitas.ca.gov/government/council/",
  "palo-alto": "https://www.cityofpaloalto.org/Government/City-Clerk/Meetings-Agendas-Minutes",
};

export default function GovernmentView({ selectedCities }: Props) {
  const [digests, setDigests] = useState<Map<string, DigestData>>(() => {
    const map = new Map<string, DigestData>();
    for (const [city, digest] of Object.entries(staticDigests)) {
      map.set(city, digest);
    }
    return map;
  });
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const refreshDigest = useCallback(async (city: City) => {
    setLoading((prev) => new Set(prev).add(city));
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(city);
      return next;
    });
    try {
      const res = await fetch(`/api/south-bay/digest?city=${city}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      const digest: DigestData = await res.json();
      setDigests((prev) => new Map(prev).set(city, digest));
    } catch (e) {
      setErrors((prev) =>
        new Map(prev).set(
          city,
          e instanceof Error ? e.message : "Failed to load",
        ),
      );
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(city);
        return next;
      });
    }
  }, []);

  const orderedCities = useMemo(
    () => CITY_ORDER.filter((c) => selectedCities.has(c)),
    [selectedCities],
  );

  return (
    <div className="gov-view">
      {/* ── 1. Ask the Records (promoted to top) ── */}
      <MinutesSearchCard selectedCities={selectedCities} />

      {/* ── 2. Council Digests turnstile ── */}
      <div className="sb-section-header" style={{ marginBottom: 4 }}>
        <span className="sb-section-title">Council Digests</span>
      </div>
      <p className="gov-section-blurb">
        Plain-English summaries of recent council meetings — what was discussed, what was decided.
        Use the arrows or city pills to flip through.
      </p>
      <CouncilDigestTurnstile
        cities={orderedCities}
        digests={digests}
        upcomingMeetings={upcomingMeetings as Record<string, UpcomingMeeting | undefined>}
        agendaUrls={AGENDA_URLS}
        onRefresh={refreshDigest}
        loading={loading}
        errors={errors}
      />

      {/* ── 3. 2026 Elections ── */}
      <div style={{ marginTop: 32 }}>
        <ElectionsCard />
      </div>

      {/* ── 4. What's Being Built (filtered to active near-term projects) ── */}
      <DevelopmentView />
    </div>
  );
}
