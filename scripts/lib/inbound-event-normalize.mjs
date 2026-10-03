import { isTrackerUrl } from "../../src/lib/south-bay/unwrapTrackerUrl.mjs";

const PT = "America/Los_Angeles";

export const JEREMY_FREY_EXHIBITION_URL = "https://museum.stanford.edu/exhibitions/jeremy-frey-woven-0";
export const PAPAHUGS_OCCURRENCE_URL = "https://www.cdm.org/event/papahugs/";
// JAMsj publishes tinyurl.com/jamsj-sjgiants for this sales group; unwrap resolves here.
export const SJ_GIANTS_JAPANESE_HERITAGE_2026_07_26_URL =
  "https://mlb.tickets.com/schedule/?agency=MILB_MPV&orgid=56749#/sales_group_code;salesGroupId=13349";
// Levi's Stadium sends every link through ls.49ers.com, whose whole path is one
// opaque per-send token. The stadium's own event index is the durable stand-in.
export const LEVIS_STADIUM_EVENTS_URL = "https://levisstadium.com/events/";
// The R&B Tour — Levi's Stadium, Aug 28 / Aug 29 / Sep 1 2026. Three separate
// newsletters described these shows and all three start times were wrong:
// the 49ers' April "ON SALE NOW" blast carried no showtime at all (the
// extractor invented 12:00/2:00/4:00 PM across the three dates), and Santa
// Clara's traffic advisory says "gates opening at 6:00 PM" — a gates time,
// not a curtain. Ticketmaster and Live Nation list all three at 7:00 PM.
export const RANDB_TOUR_2026_URL = "https://levisstadium.com/event/chris-brown-usher-the-randb-tour/";
const RANDB_TOUR_2026_DATES = new Set(["2026-08-28", "2026-08-29", "2026-09-01"]);
export const SILICON_VALLEY_PRIDE_2026_URL = "https://www.svpride.com/parade";

// Some newsletter trackers can't be unwrapped — Books Inc.'s Adestra links
// (l.e.booksinc.com/rts/go2.aspx) serve a 200 instead of redirecting once the
// blast expires, so unwrapMany caches them as identity and the raw wrapper
// would otherwise be published. A wrapper URL is worse than none: it's a dead
// link that also carries the per-subscriber id from our own newsletter
// signup. Fall back to the venue's own events page where we know one — these
// are the same canonical URLs our first-party scrapers already use.
const TRACKER_FALLBACKS = [
  { match: /\bbooksinc\.com\b/i, url: "https://www.booksinc.com/pages/events" },
  { match: /\bls\.49ers\.com\b/i, url: LEVIS_STADIUM_EVENTS_URL },
];

// The newsletter extractor did not retain links for these dated events.
// Each replacement points to the organizer's official event or calendar page.
// October follow-up evidence: docs/qa/2026-10-02-primary-url-disposition.json.
const VERIFIED_INBOUND_URLS = new Map([
  ["2026-09-27|Triton Tea Time with Preston Metcalf", "https://www.tritonmuseum.org/events"],
  ["2026-09-27|Genealogy Society Sunday Social", "https://www.sclibrary.org/Home/Components/Calendar/Event/113847/67?curm=9&cury=2026&recordid=17517"],
  ["2026-09-28|Costume Design Talk with Bianca Hernandez-Knight", "https://www.library.sunnyvale.ca.gov/events/calendar-month-view"],
  ["2026-09-30|Ordinary People (1980) Screening with Film Professor Discussion", "https://www.library.sunnyvale.ca.gov/Home/Components/Calendar/Event/12969/74?curm=9&cury=2026"],
  ["2026-09-29|Lecture: How the Internet Benefits Humanity", "https://www.sclibrary.org/Home/Components/Calendar/Event/113212/7956?curm=9&cury=2026"],
  ["2026-10-03|Palo Alto Art Walk + Art & Dine", "https://www.pacificartleague.org/community-events/f"],
  ["2026-10-02|Organ Concert with Dr. Alison Luedecke", "https://www.agosanjose.org/events/alison-luedecke-recital"],
  ["2026-10-02|First Friday: New Ballet Season Preview", "https://sjmusart.org/event/first-friday-new-ballet-season-preview"],
  ["2026-10-02|South First Friday: Thresholds of Memory Exhibition", "https://montalvoarts.org/experience/arts/art-architecture-maybe/thresholds/"],
  ["2026-10-02|Yarn Lab", "https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/429d0a7"],
  ["2026-10-02|Hispanic American Heritage Month Movie: La Bamba (1987)", "https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/429d0a7"],
  ["2026-10-03|Sutter Family Yoga", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114703/"],
  ["2026-10-03|Teens Teach: Sustainability and Our Changing Climate", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114469/"],
  ["2026-10-03|Ukrainian English Storytime", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114606/"],
  ["2026-10-05|U.S. Citizenship Test Preparation Class", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114749/"],
  ["2026-10-06|Reading With Pets", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114320/"],
  ["2026-10-07|Middle School Hang Out at Mission Branch Library", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114709/"],
  ["2026-10-07|Coffee With a Cop", "https://www.sjpd.org/Home/Components/Calendar/Event/2808/"],
  ["2026-10-08|Landlord/Tenant Counseling with Project Sentinel", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/108781/"],
  ["2026-10-09|PAL Speaker Series: Nature Through a Photographer's Eye w/ Judy Kramer", "https://www.pacificartleague.org/community-events/pacific-art-league-speaker-series-nature-through-a-photographers-eye"],
  ["2026-10-10|Devon Blood Artist & Book Talk", "https://www.eventbrite.com/e/devon-blood-artist-and-book-talk-tickets-1990018921163"],
  ["2026-10-14|Quilling Craft Club", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/113797/"],
  ["2026-10-14|Halloween Costume Swap", "https://www.sunnyvale.ca.gov/Home/Components/Calendar/Event/12569/19?curm=10&cury=2026"],
  ["2026-10-16|Art + Climate Symposium: Reimagining Our Waterways", "https://sjmusart.org/reimagining-our-waterways"],
  ["2026-10-17|Community Ignition Opening Reception at NUMU", "https://www.numulosgatos.org/events/community-ignition"],
  ["2026-10-17|Community Ignition Opening Reception", "https://www.numulosgatos.org/events/community-ignition"],
  ["2026-10-17|Halloween Costume Swap", "https://www.sclibrary.org/Home/Components/Calendar/Event/114327/7953?curm=10&cury=2026"],
  ["2026-10-17|Reinvent Yourself: A Career Without Borders - Session 1", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114312/"],
  ["2026-10-17|Men's Basketball Exhibition: Santa Clara vs. Stanford", "https://scubroncos.scu.edu/events/santa-clara-mens-basketball-vs-stanford-exhibiti-yzr8oa"],
  ["2026-10-17|DIY Alebrije: Dia de los Muertos Edition", "https://bagi.org/products/diy-alebrije-dia-de-los-muertos-edition"],
  ["2026-10-19|U.S. Citizenship Test Preparation Class", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114751/"],
  ["2026-10-22|FamilySearch at a Glance - Genealogy Toolbox Class", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/113737/"],
  ["2026-10-22|LGMSPD Recognition Luncheon", "https://www.montesereno.org/civicalerts.aspx?AID=702"],
  ["2026-10-24|Reinvent Yourself: A Career Without Borders - Session 2", "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114312/"],
  ["2026-10-28|Spooky StoryWalk", "https://www.sunnyvale.ca.gov/Home/Components/Calendar/Event/12565/19?curm=10&cury=2026"],
  ["2026-11-14|Congressional Gold Medal Dedication and Community Gathering", "https://docs.google.com/forms/d/e/1FAIpQLScMx_iIyKoadtSfZCEThqqEB2owdouilhGyIqTOiqOaSEiezQ/viewform"],
  ["2026-11-15|Wreathmaking Workshop (10am session)", "https://my.montalvoarts.org/3275/3276"],
  ["2026-11-15|Wreathmaking Workshop (3pm session)", "https://my.montalvoarts.org/3275/3277"],
  ["2026-11-21|Triton Holiday Art Fair", "https://www.eventbrite.com/e/triton-holiday-art-fair-tickets-1998434110220"],
  ["2026-12-06|Hélène Grimaud Piano Recital", "https://ticketing.purchase.live.stanford.edu/stanfordlive/website/ChooseSeats.aspx?EventInstanceId=33401&resize=true"],
  ["2027-01-14|Poetry Live! with Franny Choi and Cameron Awkward-Rich", "https://live.stanford.edu/events/26-27season/studio/poetry-live"],
  ["2027-03-16|Buena Vista Orchestra", "https://montalvoarts.org/experience/carriage-house-concerts/the-buena-vista-orchestra/"],
]);

function detrack(url) {
  if (!url || !isTrackerUrl(url)) return url;
  const fallback = TRACKER_FALLBACKS.find((f) => f.match.test(url));
  return fallback ? fallback.url : "";
}

export function inboundClock(value) {
  if (!value) return null;
  // Newsletter extraction uses midnight/end-of-day as "time not supplied".
  // Reject that sentinel in the source string before timezone conversion: an
  // incorrect fixed offset can otherwise turn midnight into 1 AM or 11 PM at
  // a daylight-saving boundary.
  if (/T(?:00:00:00|23:59:59)(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/i.test(String(value))) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const detailed = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: PT,
  }).replace(/\s+/g, " ");
  if (detailed === "12:00:00 AM" || detailed === "11:59:59 PM") return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PT,
  }).replace(/\s+/g, " ");
}

function officialOverride(event) {
  const date = String(event?.startsAt || "").slice(0, 10);
  const identity = `${event?.title || ""} ${event?.location || ""}`;
  // The city's Sept. 2026 notice gives doors at 5 PM and one address at 6 PM.
  // Normalize both newsletter copies before dedup so doors aren't a second talk.
  // https://www.santaclaraca.gov/recreation-community/events/state-of-the-city
  if (date === "2026-09-30" && /state of the city/i.test(identity)
      && /mission city center for performing arts/i.test(identity)) {
    return {
      time: "6:00 PM",
      endTime: null,
      venue: "Mission City Center for Performing Arts",
      url: "https://www.santaclaraca.gov/recreation-community/events/state-of-the-city",
    };
  }
  const verifiedUrl = VERIFIED_INBOUND_URLS.get(`${date}|${event?.title || ""}`);
  if (verifiedUrl) return { url: verifiedUrl };
  if (date === "2026-07-20" && /jeremy\s+frey\s*:\s*woven/i.test(identity) && /cantor arts center/i.test(identity)) {
    return {
      url: JEREMY_FREY_EXHIBITION_URL,
      time: "11:00 AM",
      endTime: "6:00 PM",
    };
  }
  if (
    date === "2026-07-22"
    && /(?:david\s+)?papahugs(?:\s+sharpe)?/i.test(identity)
    && /(?:children'?s discovery museum|180\s+woz way)/i.test(identity)
  ) {
    return {
      url: PAPAHUGS_OCCURRENCE_URL,
      time: "11:00 AM",
      endTime: "11:45 AM",
    };
  }
  if (
    RANDB_TOUR_2026_DATES.has(date)
    && /levi'?s\s+stadium/i.test(identity)
    && /usher/i.test(identity)
    && /chris\s+brown/i.test(identity)
  ) {
    return {
      url: RANDB_TOUR_2026_URL,
      time: "7:00 PM",
      endTime: null,
    };
  }
  if (
    date === "2026-07-26"
    && /san\s+jose\s+giants.*japanese\s+heritage|japanese\s+heritage.*san\s+jose\s+giants/i.test(identity)
    && /excite\s+ballpark/i.test(identity)
  ) {
    return {
      url: SJ_GIANTS_JAPANESE_HERITAGE_2026_07_26_URL,
      time: "5:00 PM",
      endTime: null,
    };
  }
  if (date === "2026-08-30" && /silicon\s+valley\s+pride\s+parade/i.test(identity)) {
    return {
      url: SILICON_VALLEY_PRIDE_2026_URL,
      time: "11:00 AM",
      endTime: "12:30 PM",
      venue: "Downtown San Jose — Julian Street & Market Street to Plaza Park",
    };
  }
  return null;
}

// Longest run we'll read as a single sitting. Past this, an `endsAt` is
// describing something other than when the doors close.
const MAX_INBOUND_SPAN_MS = 12 * 60 * 60 * 1000;

/**
 * True when `endsAt` can be read as a closing time for `startsAt`.
 *
 * Newsletters use `endsAt` for two different things. Sometimes it's a real end
 * time; sometimes it's the last date of a multi-week program, and rendering
 * that as a clock time produces nonsense. Monte Sereno's Community Police
 * Academy runs eight weeks — startsAt Sep 17, endsAt Nov 12, the graduation —
 * and the card read "9:00 AM – 11:00 PM".
 *
 * That 11 PM is also a DST artifact worth knowing about: the extractor stamped
 * the November date with the July offset (`2026-11-12T00:00:00-07:00`), and
 * -07:00 in November is 11 PM the previous evening in Pacific time, so
 * inboundClock's midnight sentinel never saw a midnight to reject. Comparing
 * the two instants catches it without having to trust the offset.
 */
function endsAtLooksLikeAClosingTime(startsAt, endsAt) {
  const start = new Date(startsAt ?? "");
  const end = new Date(endsAt ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const span = end.getTime() - start.getTime();
  return span > 0 && span <= MAX_INBOUND_SPAN_MS;
}

export function normalizeInboundEventPresentation(event) {
  const override = officialOverride(event);
  const time = override?.time || inboundClock(event?.startsAt);
  const parsedEndTime = endsAtLooksLikeAClosingTime(event?.startsAt, event?.endsAt)
    ? inboundClock(event?.endsAt)
    : null;
  const endTime = override?.endTime || (parsedEndTime && parsedEndTime !== time ? parsedEndTime : null);
  return {
    time,
    endTime,
    url: override?.url || detrack(event?.canonicalUrl) || detrack(event?.sourceUrl) || "",
    ...(override?.venue ? { venue: override.venue } : {}),
  };
}
