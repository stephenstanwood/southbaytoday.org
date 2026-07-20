const MUSIC_IN_THE_PARK_URL = "https://www.losgatosca.gov/350/Music-in-the-Park";
const JAZZ_ON_THE_PLAZZ_URL = "https://jazzontheplazz.com/2026-concerts/";

const MUSIC_IN_THE_PARK_IMAGE =
  "https://images.unsplash.com/photo-1763889245414-7f6e8e2a34ce?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w5MTk0MTN8MHwxfHNlYXJjaHwxfHxsaXZlJTIwbXVzaWMlMjBjb25jZXJ0JTIwcGVyZm9ybWFuY2V8ZW58MHwyfHx8MTc3NzIzMDYxNnww&ixlib=rb-4.1.0&q=80&w=400";

const jazzImage = (filename) =>
  `https://jazzontheplazz.com/wp-content/uploads/${filename}`;

/**
 * First-party verified 2026 Los Gatos summer-concert schedules.
 *
 * Music in the Park:
 * https://www.losgatosca.gov/350/Music-in-the-Park
 * Jazz on the Plazz:
 * https://jazzontheplazz.com/2026-concerts/
 *
 * Verified 2026-07-19. Keep the full seasons here; consumers choose their
 * date window so past concerts can live in the archive while future concerts
 * remain in upcoming-events.json.
 */
export const LOS_GATOS_SUMMER_CONCERTS_2026 = Object.freeze([
  {
    series: "music-in-the-park",
    date: "2026-07-19",
    performer: "The Houserockers",
    occurrenceUrl: "https://www.losgatosca.gov/calendar.aspx?EID=6249",
  },
  {
    series: "music-in-the-park",
    date: "2026-07-26",
    performer: "Estero",
    occurrenceUrl: "https://www.losgatosca.gov/calendar.aspx?EID=6250",
  },
  {
    series: "music-in-the-park",
    date: "2026-08-02",
    performer: "The BentPeter Band",
    occurrenceUrl: "https://www.losgatosca.gov/calendar.aspx?EID=6251",
  },
  {
    series: "music-in-the-park",
    date: "2026-08-09",
    performer: "Lindsay and the Cheeks",
    occurrenceUrl: "https://www.losgatosca.gov/calendar.aspx?EID=6252",
  },
  {
    series: "music-in-the-park",
    date: "2026-08-16",
    performer: "Miko Marks",
    occurrenceUrl: "https://www.losgatosca.gov/calendar.aspx?EID=6253",
  },
  {
    series: "music-in-the-park",
    date: "2026-08-23",
    performer: "Harry and the Hitmen",
    occurrenceUrl: "https://www.losgatosca.gov/calendar.aspx?EID=6254",
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-07-08",
    performer: "The Jazz Sophisticates Dance Orchestra",
    description:
      "A fourteen-piece Jazz Age dance orchestra featuring vocalist Heidi Evelyn.",
    image: jazzImage("2026/04/DAISY_ROSE_COBY.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-07-15",
    performer: "Pacific Mambo Orchestra",
    description:
      "The Grammy-winning Latin big band blends mambo, salsa, Latin jazz, and big-band music.",
    image: jazzImage("2026/04/pacific-mambo-orchestra.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-07-22",
    performer: "Tony Lindsay & The Soul Soldiers",
    description:
      "The longtime Santana vocalist performs soul, R&B, and contemporary jazz with The Soul Soldiers.",
    image: jazzImage("2025/04/tonylindsay_1image.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-07-29",
    performer: "Jessica Johnson",
    time: "6:00 PM",
    description:
      "Jessica Johnson headlines after a 6 PM opening set by the San Jose High School Jazz All-Stars.",
    image: jazzImage("2026/04/JessicaJohnson.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-08-05",
    performer: "Full Spectrum Big Band",
    description:
      "A contemporary big-band set spanning funk, fusion, Latin jazz, and smooth jazz.",
    image: jazzImage("2025/04/FSJ.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-08-12",
    performer: "Smoked Out Soul",
    description:
      "A live-band and DJ hybrid blending classic soul and funk with modern production.",
    image: jazzImage("2026/04/Smokedoutsoul.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-08-19",
    performer: "Pamela Parker's Fantastic Machine",
    description:
      "Pamela Parker leads a piano-centered ensemble through jazz, blues, and soul.",
    image: jazzImage("2026/04/PamelaParker.jpg"),
  },
  {
    series: "jazz-on-the-plazz",
    date: "2026-08-26",
    performer: "Gunhild Carling",
    description:
      "Multi-instrumentalist Gunhild Carling closes the season with classic jazz and swing.",
    image: jazzImage("2026/04/GunhildCarling.jpg"),
  },
]);

function displayDate(date) {
  return new Date(`${date}T12:00:00-07:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function buildConcert(spec) {
  if (spec.series === "music-in-the-park") {
    return {
      id: `los-gatos-music-in-the-park-${spec.date}`,
      title: `Music in the Park - ${spec.performer}`,
      date: spec.date,
      displayDate: displayDate(spec.date),
      time: "5:00 PM",
      endTime: "7:00 PM",
      venue: "Los Gatos Civic Center Lawn",
      address: "110 E. Main Street, Los Gatos, CA 95030",
      city: "los-gatos",
      category: "music",
      cost: "free",
      description: `Free, family-friendly outdoor concert featuring ${spec.performer}.`,
      url: spec.occurrenceUrl || MUSIC_IN_THE_PARK_URL,
      source: "Town of Los Gatos",
      kidFriendly: true,
      audienceAge: "all",
      image: MUSIC_IN_THE_PARK_IMAGE,
      blurb: `Hear ${spec.performer} at Los Gatos' free Sunday concert series.`,
      occurrenceEvidence: {
        kind: "first-party-occurrence-page",
        date: spec.date,
        sourceUrl: spec.occurrenceUrl || MUSIC_IN_THE_PARK_URL,
        checkedAt: "2026-07-20T02:12:53.000Z",
      },
    };
  }

  return {
    id: `los-gatos-jazz-on-the-plazz-${spec.date}`,
    title: `Jazz on the Plazz - ${spec.performer}`,
    date: spec.date,
    displayDate: displayDate(spec.date),
    time: spec.time || "6:30 PM",
    endTime: "8:30 PM",
    venue: "Los Gatos Town Plaza Park",
    address: "Montebello Way, Los Gatos, CA 95030",
    city: "los-gatos",
    category: "music",
    cost: "free",
    description: spec.description,
    url: JAZZ_ON_THE_PLAZZ_URL,
    source: "Los Gatos Music & Arts",
    kidFriendly: false,
    audienceAge: "all",
    image: spec.image,
    blurb: `Hear ${spec.performer} at the free Jazz on the Plazz concert series.`,
    occurrenceEvidence: {
      kind: "first-party-occurrence-page",
      date: spec.date,
      sourceUrl: JAZZ_ON_THE_PLAZZ_URL,
      checkedAt: "2026-07-20T02:12:53.000Z",
    },
  };
}

export function getLosGatosSummerConcerts({
  fromDate = "0000-01-01",
  throughDate = "9999-12-31",
} = {}) {
  return LOS_GATOS_SUMMER_CONCERTS_2026
    .filter((spec) => spec.date >= fromDate && spec.date <= throughDate)
    .map(buildConcert);
}

function matchingSeries(event, concertBySeriesDate) {
  if (!event || event.city !== "los-gatos" || !event.date) return null;

  const title = String(event.title || "");
  const url = String(event.url || event.sourceUrl || "");
  const musicKey = `music-in-the-park|${event.date}`;
  const jazzKey = `jazz-on-the-plazz|${event.date}`;

  if (
    concertBySeriesDate.has(musicKey)
    && (/\bmusic in the park\b/i.test(title) || /\/Music-in-the-Park\b/i.test(url))
  ) return musicKey;

  if (
    concertBySeriesDate.has(jazzKey)
    && (/\bjazz on the plazz\b/i.test(title) || /jazzontheplazz\.com/i.test(url))
  ) return jazzKey;

  return null;
}

/**
 * Replace generic, duplicate, or newsletter-derived rows for these two series
 * with one canonical first-party row per scheduled performance.
 */
export function mergeLosGatosSummerConcerts(events, options = {}) {
  const canonical = getLosGatosSummerConcerts(options);
  const concertBySeriesDate = new Map(
    canonical.map((event) => [
      `${event.id.includes("jazz-on-the-plazz") ? "jazz-on-the-plazz" : "music-in-the-park"}|${event.date}`,
      event,
    ]),
  );

  const output = [];
  const emitted = new Set();
  let replacedCount = 0;

  for (const event of events || []) {
    const key = matchingSeries(event, concertBySeriesDate);
    if (!key) {
      output.push(event);
      continue;
    }

    replacedCount++;
    if (emitted.has(key)) continue;

    const replacement = { ...concertBySeriesDate.get(key) };
    if (event.firstSeenAt) replacement.firstSeenAt = event.firstSeenAt;
    output.push(replacement);
    emitted.add(key);
  }

  for (const [key, event] of concertBySeriesDate) {
    if (!emitted.has(key)) output.push({ ...event });
  }

  return {
    events: output,
    canonicalEvents: canonical,
    replacedCount,
    addedCount: canonical.length - emitted.size,
  };
}
