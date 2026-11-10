// Occurrence-specific corrections verified against first-party sources.
// Keep these upstream of blurb resolution so nightly refreshes cannot restore
// a sparse aggregator record or its previously invented cached copy.
// Evidence: docs/qa/2026-09-05-newsletter.md, 2026-09-06-newsletter.md, and
// 2026-09-08-newsletter.md.
import { REGISTRATION_APPOINTMENT, REGISTRATION_CLOSED, REGISTRATION_FULL, REGISTRATION_NONE, REGISTRATION_REQUIRED } from "./eventFilters.mjs";

const ART_MAKING_ACTIVITY = /\b(?:(?:make|making|create|creating)\s+(?:your\s+own\s+)?art|art[\s-]making|hands[\s-]on\s+art|(?:paint|draw)\s+(?:a|an|your|with)|(?:painting|drawing)\s+(?:activity|workshop|class))\b/i;

function museumMinisWithoutArtMaking(event) {
  return event?.date === "2026-11-16"
    && event?.url === "https://events.stanford.edu/event/November-museum-minis-storytime-at-the-anderson"
    && !ART_MAKING_ACTIVITY.test(sourceText(event));
}

const DERBY_ATTENDANCE = "12 first-come, first-served tickets. The library’s pickup instructions conflict with its 2 PM start; confirm pickup timing with Berryessa Library before going.";
const HILLVIEW_HALLOWEEN_TIMING = "The library lists the event for 12:30–1:30 PM, but its storytime breakdown uses a conflicting AM label. Confirm the session timing with Hillview Library.";
const LINKEDIN_STREAM_DESCRIPTION = "Stream-processing meetup hosted by LinkedIn, focused on Apache Kafka, Apache Flink, and Change Data Capture.";
const STANFORD_EP_ADMISSION = "In person: nurses and advanced practice providers $90; physicians $140; industry $390. Free for Stanford affiliates registering with a Stanford email; virtual attendance is free.";
const LOS_ALTOS_TEEN_DND_DATES = {
  "693b4639ddf563280020736e": "2026-11-05",
  "693b4639ddf563280020736f": "2026-11-12",
  "693b4639ddf5632800207370": "2026-11-19",
};
const CALABAZAS_PRINT_LIMIT_DATES = {
  "6ad7b5ac377296003a4d47e1": "2026-11-03",
  "6ad7b5ac377296003a4d47e3": "2026-11-10",
};
// Dated organizer pages confirm these Break Room performances, including the
// two separate December 5 shows. Never infer another occurrence from this list.
// Evidence: docs/qa/2026-10-30-2307-fact-check.md.
const SJZ_BREAK_ROOM_2026_OCCURRENCES = [
  ["2026-10-30", "top-chefs", "paid"],
  ["2026-10-31", "legally-blue-2", "paid"],
  ["2026-11-06", "sjz-break-room-jazz-jam-2", "free"],
  ["2026-11-13", "emily-day-cosmo-alleycats", "paid"],
  ["2026-11-14", "andre-cruz-black-diamond-rhythm-band", "paid"],
  ["2026-11-20", "black-nile", "paid"],
  ["2026-11-21", "sandra-katrina-pacheco-music-of-amalia-rodrigues", "paid"],
  ["2026-11-25", "noah-the-arkiteks", "paid"],
  ["2026-12-04", "sjz-break-room-jazz-jam-3", "free"],
  ["2026-12-05", "scott-amendola-jeff-parker-paul-bryan", "paid"],
  ["2026-12-05", "scott-amendola-jeff-parker-paul-bryan-2", "paid"],
];
const SJSU_NOVEMBER_READING = {
  title: "I, Robot - Campus Reading Discussion",
  time: "3:30 PM", endTime: "4:30 PM",
  venue: "Campus Village B RAC (1st floor)", address: "350 S 10th St, San José, CA 95112",
  description: "Discuss I, Robot's sixth story, Little Lost Robot, with Professor Hilary Hurst from 3:30–4:30 PM in the Campus Village B RAC (1st floor). The calendar lists SJSU employees and students as its audience; public attendance is unconfirmed.",
  blurb: "Discuss Little Lost Robot with Professor Hilary Hurst in Campus Village B RAC; confirm public eligibility with the organizer.",
  attendanceStatus: "needs-confirmation",
  attendanceNote: "The current listing covers the 3:30–4:30 PM discussion and names SJSU employees and students as its audience. Confirm public eligibility with the organizer. The later film is a separate program.",
};
const SJSU_NOVEMBER_METROPOLIS = {
  title: "HumHonCultureCon Movie Event: Metropolis (1927)",
  time: "3:30 PM", endTime: null, cost: "free",
  venue: "Dr. Martin Luther King, Jr. Library, Room 225",
  address: "150 E. San Fernando Street, San Jose, CA 95112",
  url: "https://events.sjsu.edu/event/humhonculturecon-movie-event-metropolis-1927",
  description: "Watch Fritz Lang's Metropolis (1927) with live accompaniment by members of the SJSU Saxophone Studio. Free and open to the campus community and general public, November 10 at 3:30 PM in King Library Room 225.",
  blurb: "Watch Metropolis (1927) with live accompaniment by the SJSU Saxophone Studio in King Library Room 225.",
  attendanceStatus: "needs-confirmation",
  attendanceNote: "The event page lists a 6 PM finish, while the organizer's poster lists 6:30 PM. Confirm the finish with SJSU's Humanities Honors Program before going.",
};

// Only the first matching correction applies. Extend an existing occurrence's
// rule when revisiting it so newer metadata cannot mask its earlier copy repair.
const CORRECTIONS = [
  // The authenticated November 9 city newsletter distinguishes optional
  // event signup from the volunteer application needed for service credit.
  // Evidence: docs/qa/2026-11-10-0507z-fact-check.md.
  {
    date: "2026-11-12",
    matches: event => event.url === "https://sunnyvale.libcal.com/event/16531840"
      && event.title === "Teen Volunteer Club: Letters Against Isolation"
      && event.venue === "Sunnyvale Main Library",
    facts: {
      blurb: "Write letters for seniors with Letters Against Isolation. Teens age 13+ seeking volunteer hours must be registered library volunteers or apply.",
    },
    appendAttendanceNote: "Event registration is optional. To earn volunteer hours, you must be a registered library volunteer; new volunteers must apply.",
  },
  // Current organizer pages and authenticated newsletter originals confirm
  // these exact occurrences. Preserve their clocks unless explicitly corrected.
  // Evidence: docs/qa/2026-11-10-0007z-fact-check.md.
  {
    date: "2026-11-24",
    matches: event => event.url === "https://www.ticketmaster.com/houston-dynamo-at-san-jose-earthquakes-western-conference-round-one-home-game-1-san-jose-california-11-24-2026/event/Z7r9jZ1AA7ff6"
      && event.venue === "PayPal Park"
      && event.title === "Houston Dynamo at San Jose Earthquakes: Western Conference Round One (Home Game 1)",
    facts: { category: "sports" },
  },
  {
    date: "2027-01-30",
    matches: event => /^https:\/\/www\.eventbrite\.com\/e\/painting-the-year-of-the-ram-ink-painting-on-canvas-teensadults-tickets-2004454467270\/?(?:[?#].*)?$/.test(event.url || "")
      && event.title === "Painting the Year of the Ram: Ink Painting on Canvas (Teens/Adults)"
      && event.venue === "Linn Studio behind the Triton Museum of Art",
    facts: { cost: "paid", costNote: "$30 per person; materials included" },
    appendAttendanceNote: "Ages 13+; select the afternoon teen/adult workshop when registering.",
  },
  {
    date: "2026-12-10",
    matches: event => event.url === "https://business.campbellchamber.net/events/details/making-spirits-bright-festive-community-open-house-16560"
      && event.title === "Making Spirits Bright Community Open House" && event.venue === "Darling Fischer",
    facts: { category: "community", costNote: "$15 suggested donation; includes appetizers and one beer/wine drink ticket" },
    // Unknown-price event pages omit cost badges, so keep the voluntary terms
    // in the visible attendance note as well as the structured cost note.
    appendAttendanceNote: "$15 suggested donation includes appetizers and one beer/wine drink ticket. Advance RSVP is appreciated; walk-ins are welcome.",
  },
  {
    date: "2026-11-13",
    matches: event => event.url === "https://business.campbellchamber.net/events/details/ribbon-cutting-nexis-detailing-16561"
      && /^Nexis Detailing Ribbon Cutting$/i.test(event.title || "")
      && /^NEXIS Detailing Automotive Refinement$/i.test(event.venue || ""),
    facts: { cost: "free", endTime: "6:30 PM" },
  },
  {
    date: "2026-11-09",
    matches: event => !event.url && event.title === "Stanford Palo Alto Veterans Day Celebration"
      && event.venue === "MacArthur Park Restaurant & Bar" && event.time === "3:00 PM",
    facts: { url: "https://events.stanford.edu/event/stanford-university-palo-alto-veterans-day-celebration" },
  },
  {
    date: "2026-11-10",
    matches: event => event.venue === "Encina Commons"
      && event.url === "https://events.stanford.edu/event/protest-and-politics-in-turkey-in-the-70s",
    facts: { cost: "free" },
  },
  {
    date: "2026-11-10",
    matches: event => event.venue === "Building 360"
      && event.url === "https://events.stanford.edu/event/l-maria-bo-writing-on-water-cold-war-literary-translations-and-the-chinese-diaspora",
    facts: { cost: "free" },
  },
  // The Jazz calendar reused Black Nile's excerpt for Brass Queens. The
  // band's own dated detail page supplies its identity and ticket price.
  // https://sanjosejazz.org/events/brass-queens/
  // Evidence: docs/qa/2026-11-09-2007z-fact-check.md.
  {
    date: "2026-12-03",
    matches: event => /^https:\/\/(?:www\.)?sanjosejazz\.org\/events\/brass-queens\/?(?:[?#].*)?$/.test(event.url || "")
      && event.title === "Brass Queens" && event.venue === "SJZ Break Room",
    facts: {
      cost: "paid", costNote: "$27 including fees",
      description: "Brass Queens is a female-led brass band from New York, blending New Orleans brass traditions with pop and reggaeton. The December 3 show at SJZ Break Room starts at 8 PM; doors open at 7 PM. Tickets are $27 including fees.",
      blurb: "Hear New York's female-led Brass Queens blend New Orleans brass traditions with pop and reggaeton at SJZ Break Room.",
    },
  },
  // Five published occurrences share an explicit body-text price and signup
  // condition that the OpenCities Cost-box-only parser missed. Never create
  // another date or override a later full/closed state.
  // https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Join-A-Ranger-Night-Hike-and-Flashlight-Tour
  // Evidence: docs/qa/2026-11-09-2007z-fact-check.md.
  {
    dateFrom: "2026-11-13", dateThrough: "2027-03-05",
    matches: event => ["2026-11-13", "2026-12-18", "2027-01-15", "2027-02-19", "2027-03-05"].includes(event.date)
      && event.url === "https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Join-A-Ranger-Night-Hike-and-Flashlight-Tour"
      && event.venue === "McClellan Ranch Preserve"
      && /\ball attendees must register\b/i.test(event.description || ""),
    facts: { cost: "low", costNote: "$10 resident; $13 nonresident", registration: REGISTRATION_REQUIRED },
    appendAttendanceNote: "All attendees must register. Children must be accompanied by an adult.",
  },
  // The museum's November 9 newsletter says 1–3 PM; its exact ticket page
  // says 10 AM–noon, explicitly in America/Los_Angeles. Neither establishes
  // a settled start. Keep the occurrence with a confirmation notice, outside
  // recommendations, rather than choose a clock from one conflicting source.
  // https://www.eventbrite.com/e/little-rams-leap-ink-painting-on-canvas-for-children-tickets-2004454841389
  // Evidence: docs/qa/2026-11-09-2007z-fact-check.md.
  {
    date: "2027-01-30",
    matches: event => /^https:\/\/www\.eventbrite\.com\/e\/little-rams-leap-ink-painting-on-canvas-for-children-tickets-2004454841389\/?(?:[?#].*)?$/.test(event.url || "")
      && /^Little Rams Leap: Ink Painting on Canvas \((?:For )?Children\)$/.test(event.title || "")
      && event.venue === "Linn Studio behind the Triton Museum of Art",
    facts: {
      time: null, endTime: null, cost: "paid", costNote: "$30 per child; materials included",
      attendanceStatus: "needs-confirmation",
    },
    appendAttendanceNote: "The museum newsletter lists 1–3 PM, but its Eventbrite page lists 10 AM–noon Pacific. Confirm the workshop time with Triton Museum before booking or going.",
  },
  // Recover source links lost by newsletter extraction. Match only the dated
  // program at its verified venue and preserve any later supplied URL.
  // Evidence: docs/qa/2026-11-09-2007z-fact-check.md.
  {
    date: "2026-11-13",
    matches: event => !event.url && event.title === "Ceremonial Check Presentation for Fire Truck Replacement Funding"
      && event.venue === "Sunnyvale Fire Station Five",
    facts: { url: "https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/431c99d" },
  },
  {
    date: "2026-12-02",
    matches: event => !event.url && event.title === "Triton Book Club: A Christmas Carol"
      && event.venue === "Triton Museum of Art",
    facts: { url: "https://www.tritonmuseum.org/book-club" },
  },
  {
    date: "2026-11-21",
    matches: event => /^https:\/\/www\.eventbrite\.com\/e\/triton-holiday-art-fair-tickets-1998434110220\/?(?:[?#].*)?$/.test(event.url || "")
      && event.title === "Triton Holiday Art Fair" && event.venue === "Triton Museum of Art",
    facts: { cost: "free" },
  },
  // Montalvo names this dated show Taking Tangents Tour and explicitly limits
  // entry to ages 18+ with valid photo ID. The newsletter's Shelf Help title
  // and missing audience gate survived the separate start-time backfill.
  // https://montalvoarts.org/experience/carriage-house-concerts/taking-tangents-tour/
  // Evidence: docs/qa/2026-11-09-1207z-fact-check.md.
  {
    date: "2027-03-25",
    matches: event => /^https:\/\/montalvoarts\.org\/experience\/carriage-house-concerts\/taking-tangents-tour\/?(?:[?#].*)?$/.test(event.url || "")
      && /^(?:Comedian )?David Nihill: (?:Shelf Help|Taking Tangents Tour)$/.test(event.title || "")
      && /^(?:The )?Carriage House(?: Theatre)?(?:, Montalvo Arts Center(?:,.*)?)?$/.test(event.venue || ""),
    facts: {
      title: "David Nihill: Taking Tangents Tour", time: "7:30 PM",
      audienceAge: "adult", kidFriendly: false, sourceAudiences: ["Adults 18+"],
    },
    appendAttendanceNote: "Ages 18+; valid photo ID required for entry.",
    copyReplacements: [[/;\s*no start time given\./gi, "."]],
  },
  // These exact SJPL occurrences allow attendance without advance booking.
  // A capped signup form or phone-registration instruction does not make
  // optional signup mandatory. Keep the source's space-available condition
  // and stop overriding when its wording or explicit availability changes.
  // Evidence: docs/qa/2026-11-09-0307z-fact-check.md (fresh exact-ID responses).
  {
    date: "2026-11-12",
    matches: event => /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/6a83721e4cb69d003e216ef3\/?$/.test(event.url || "")
      && event.venue === "Bascom Library" && event.time === "4:00 PM"
      && /\bregistration\s+(?:is\s+)?encouraged\s+but\s+not\s+required\b/i.test(event.description || "")
      && !/\bregistration\s+(?:is\s+)?(?:required|mandatory)\b|\bmust\s+(?:register|reserve|book)\b/i.test(event.description || "")
      && ![REGISTRATION_FULL, REGISTRATION_CLOSED, REGISTRATION_APPOINTMENT].includes(event.registration),
    facts: {
      registration: REGISTRATION_NONE, registrationClosesBy: null,
      attendanceNote: "Registration is encouraged but not required.",
    },
  },
  {
    date: "2026-11-12",
    matches: event => /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/6920f0bad6833e76917eb5e9\/?$/.test(event.url || "")
      && event.venue === "Rose Garden Library" && event.time === "5:00 PM"
      && /\bappointments\s+are\s+highly\s+encouraged\b/i.test(event.description || "")
      && /\bdrop-ins\s+can\s+be\s+taken\b[^.!?]*\bif\s+times\s+are\s+available\b/i.test(event.description || "")
      && !/\bregistration\s+(?:is\s+)?(?:required|mandatory)\b|\bmust\s+(?:register|reserve|book)\b|\bno\s+drop-ins\b|\bby\s+appointment\s+only\b/i.test(event.description || "")
      && ![REGISTRATION_FULL, REGISTRATION_CLOSED, REGISTRATION_APPOINTMENT].includes(event.registration),
    facts: { registration: REGISTRATION_NONE, registrationClosesBy: null },
  },
  // The series' first occurrence (454597) is September 23, not November 11.
  // SCU's dated RSS item and Event schema identify the November 11, 8 PM
  // occurrence as 454604. Preserve that link when RSS reuses the series URL.
  // https://events.scu.edu/center-for-spirituality-and-faith/event/454604-student-candlelight-mass
  // Evidence: docs/qa/2026-11-08-1907z-fact-check.md.
  {
    date: "2026-11-11",
    matches: event => event.title === "Student Candlelight Mass"
      && event.venue === "Mission Santa Clara de Asis" && event.time === "8:00 PM"
      && /^https:\/\/events\.scu\.edu\/(?:live\/events|center-for-spirituality-and-faith\/event)\/(?:454597|454604)-student-candlelight-mass$/.test(event.url || ""),
    facts: { url: "https://events.scu.edu/center-for-spirituality-and-faith/event/454604-student-candlelight-mass" },
  },
  // The dated Teen Center newsletter confirms the party; the city's program
  // page restricts membership to Mountain View/Los Altos students in grades
  // 6–12. Preserve the youth audience after generic text classification.
  // https://www.mountainview.gov/our-city/departments/community-services/recreation/youth-teens/teen-programs/the-view-teen-center
  // Evidence: docs/qa/2026-11-08-1007z-fact-check.md.
  {
    date: "2026-12-18",
    url: "https://anc.apm.activecommunities.com/mountainviewrecreation/activity/search/detail/19453?onlineSiteId=0&from_original_cui=true",
    facts: {
      audienceAge: "kids", kidFriendly: true,
      attendanceNote: "For Mountain View and Los Altos students in grades 6–12. A View Teen Center membership is required for activity registration.",
    },
  },
  // The foundation's exact public occurrence supplies the lost newsletter
  // link and free admission. An RSVP invitation is not a mandatory gate.
  // https://paacf.org/event/coritas-legacy-a-panel-discussion/
  // Evidence: docs/qa/2026-11-08-1007z-fact-check.md.
  {
    date: "2026-12-12",
    matches: event => /^Corita['’]s Legacy: A Panel Discussion$/.test(event.title || "")
      && /^Palo Alto Art Center(?:,|$)/.test(event.venue || "")
      && (!event.url || event.url === "https://paacf.org/event/coritas-legacy-a-panel-discussion/"),
    facts: { url: "https://paacf.org/event/coritas-legacy-a-panel-discussion/", cost: "free" },
  },
  // The organizer's dated ticket offer is free; this civil-liberties
  // gathering is community programming, not a visual-arts event. JAMsj's
  // original November newsletter independently confirms its museum offer
  // for 2027, despite the ticket page's stale 2026 year in that sentence.
  // https://www.eventbrite.com/e/fred-korematsu-day-of-civil-liberties-the-constitution-tickets-2003742722422
  // Evidence: docs/qa/2026-11-08-1007z-fact-check.md.
  {
    date: "2027-01-23",
    matches: event => /^https:\/\/www\.eventbrite\.com\/e\/fred-korematsu-day-of-civil-liberties-the-constitution-tickets-2003742722422\/?(?:[?#].*)?$/.test(event.url || ""),
    facts: { category: "community", cost: "free" },
  },
  // The exact SJPL records publish a Mandarin/English art activity on the
  // second Thursday. Their Chinese-only body was lost during display cleanup,
  // leaving the series title to generate an incorrect stories-and-songs blurb.
  // Translate only these verified November 12 sessions, including walk-up
  // ticket pickup; this list neither projects dates nor changes the clocks.
  // Evidence: docs/qa/2026-11-08-0207z-fact-check.md.
  ...["6a7e0aa9d4b10d0030064609", "6a7e0a6ed4b10d00300645be"].map(id => ({
    date: "2026-11-12",
    url: `https://sjpl.bibliocommons.com/events/${id}`,
    facts: {
      description: "This second-Thursday family session offers art activities in Mandarin and English. Free, with limited seating. Tickets are available at the Information Desk 30 minutes before the program starts.",
      attendanceNote: "Limited seating. Tickets are available at the Information Desk 30 minutes before the program starts.",
      blurb: "Join a family art activity in Mandarin and English at Calabazas Library's second-Thursday session.",
    },
  })),
  // The Improv's own dated Event offers say SoldOut and its show cards offer
  // a waitlist, while Discovery still says onsale. Match the exact ticket
  // identities and clocks; no other performance inherits this availability.
  // https://improv.com/sanjose/event/taylor+tomlinson%3a+tries+out+new+ideas/14312864/
  // Evidence: docs/qa/2026-11-08-0207z-fact-check.md.
  ...[
    ["2027-01-22", "6:00 PM", "14312834"],
    ["2027-01-22", "8:15 PM", "14312844"],
    ["2027-01-23", "6:00 PM", "14312884"],
    ["2027-01-23", "8:15 PM", "14312874"],
    ["2027-01-24", "6:00 PM", "14312864"],
  ].map(([date, time, ticketId]) => ({
    date,
    matches: event => event.time === time && event.venue === "San Jose Improv"
      && /^Taylor Tomlinson: Tries Out New Ideas$/i.test(event.title || "")
      && new RegExp(`^https://www\\.ticketweb\\.com/event/taylor-tomlinson-tries-out-new-san-jose-improv-tickets/${ticketId}/?(?:[?#]|$)`).test(event.url || ""),
    facts: {
      registration: REGISTRATION_FULL,
      attendanceNote: "Sold out. The organizer offers a waitlist. Ages 21+. Two-item minimum purchase per person.",
    },
  })),
  // The organizer cards omit the 18+ gate and five-session commitment. These
  // exact academy pages publish four evening classes and a Saturday skills
  // day; the listed clock below is the first class, not the entire academy.
  // Evidence: docs/qa/2026-11-07-1907z-fact-check.md.
  ...[
    {
      date: "2027-01-25",
      url: "https://www.eventbrite.com/e/community-emergency-response-team-cert-academy-winter-2027-campbell-tickets-2003375376681",
      venue: "Campbell Community Center's Orchard City Banquet Hall",
      schedule: "Evening classes: January 25 and 27, February 1 and 3, 6–9 PM. Skills day: February 6, 8 AM–12:30 PM.",
    },
    {
      date: "2027-04-05",
      url: "https://www.eventbrite.com/e/community-emergency-response-team-cert-academy-spring-2027-los-altos-hi-tickets-2003529728351",
      venue: "Los Altos Hills Town Hall",
      schedule: "Evening classes: April 5, 7, 12 and 14, 6–9 PM. Skills day: April 17, 8 AM–12:30 PM.",
    },
  ].map(({ date, url, venue, schedule }) => ({
    date, url,
    facts: {
      endTime: "9:00 PM", registration: REGISTRATION_REQUIRED,
      audienceAge: "adult", sourceAudiences: ["Adults, ages 18+"], kidFriendly: false,
      description: `Five-session disaster-preparedness academy for adults ages 18+ at ${venue}. ${schedule} Registration is required; all five sessions are needed to graduate.`,
      attendanceNote: `Ages 18+. Registration required; attend all five sessions to graduate. ${schedule} Registration preference is given to residents in County Fire's jurisdiction.`,
      blurb: `Start County Fire's five-session CERT academy at ${venue}; ages 18+ and advance registration required.`,
    },
  })),
  // Both exact November 15 ticket instances say sold out and offer a waitlist.
  // The overview is a duplicate of the morning occurrence at its stated clock,
  // not a third workshop. The old newsletter's finish times are unconfirmed.
  // Its postal code is also wrong: the organizer publishes 95071.
  // Evidence: docs/qa/2026-11-07-1407z-fact-check.md.
  ...[["3276", "10:00 AM"], ["3277", "3:00 PM"]].map(([performance, time]) => ({
    date: "2026-11-15",
    matches: (event) => new RegExp(`^https://my\\.montalvoarts\\.org/3275/${performance}/?(?:[?#]|$)`).test(event.url || "")
      || (time === event.time && /^https:\/\/my\.montalvoarts\.org\/overview\/3275\/?(?:[?#]|$)/.test(event.url || "")),
    facts: {
      url: `https://my.montalvoarts.org/3275/${performance}`,
      time, endTime: null, cost: "paid", registration: REGISTRATION_FULL,
      venue: "Creekside Studio at Montalvo Arts Center",
      address: "15400 Montalvo Rd, Saratoga, CA 95071",
      sourceAudiences: ["Adults"], audienceAge: "adult", kidFriendly: false,
      attendanceNote: "Sold out. The organizer offers a waitlist. All supplies are included in the workshop fee.",
      blurb: "This wreath-making workshop at Montalvo's Creekside Studio is sold out; the organizer offers a waitlist.",
    },
  })),
  // The exact organizer ticket instances confirm paid admission. The kids'
  // promotion is limited to eighth grade or younger, not unrestricted youth.
  // Evidence: docs/qa/2026-11-07-1207z-fact-check.md.
  {
    date: "2026-12-06",
    matches: (event) => event.source === "City Newsletter" && event.venue === "Maples Pavilion"
      && /^https:\/\/tickets\.gostanford\.com\/events\/6aa42f3d18db9fde45dc7752\/6aecd0d65c621b96be40ac4b(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      cost: "paid",
      costNote: "Each paid adult ticket includes up to two free tickets for children in eighth grade or younger.",
      attendanceNote: "Each paid adult ticket includes up to two free tickets for children in eighth grade or younger.",
    },
  },
  {
    date: "2026-12-06",
    matches: (event) => event.source === "City Newsletter" && event.venue === "Bing Concert Hall"
      && /^https:\/\/ticketing\.purchase\.live\.stanford\.edu\/stanfordlive\/website\/ChooseSeats\.aspx$/i.test((event.url || "").split("?")[0])
      && new URL(event.url).searchParams.get("EventInstanceId") === "33401",
    facts: { cost: "paid" },
  },
  // Original received newsletters and exact organizer records reviewed on
  // November 7. Keep admission separate from a signup link: the Sunnyvale
  // bulletin gives fees and a registration link, not a mandatory advance gate.
  // Evidence: docs/qa/2026-11-07-0907z-fact-check.md.
  {
    date: "2026-12-04",
    matches: (event) => event.source === "City Newsletter" && event.city === "sunnyvale"
      && /^https:\/\/anc\.apm\.activecommunities\.com\/sunnyvaleactivities\/activity\/search\/detail\/1704(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      cost: "paid", costNote: "$30 resident; $38 nonresident. $5 sibling discount when registering together.",
      attendanceNote: "For children ages 5–11. Register through the city's linked activity catalog.",
    },
    copyReplacements: [[/\bRegistration required; \$30 resident, \$38 nonresident\./g,
      "$30 resident, $38 nonresident. The city newsletter links to activity registration."]],
  },
  {
    date: "2026-12-03",
    matches: (event) => event.source === "City Newsletter" && event.city === "los-gatos"
      && event.title === "PCLG Christmas Tea" && event.venue === "Presbyterian Church of Los Gatos",
    facts: {
      cost: "paid", costNote: "$25; cash or check. Tickets sold during coffee hour after Sunday worship.",
    },
  },
  {
    date: "2026-12-05",
    matches: (event) => event.source === "City Newsletter" && event.city === "palo-alto"
      && event.title === "Mindfulness Meditation with Phuong Pham" && event.venue === "Palo Alto Art Center"
      && ![REGISTRATION_REQUIRED, REGISTRATION_FULL, REGISTRATION_CLOSED, REGISTRATION_APPOINTMENT].includes(event.registration),
    facts: {
      cost: "free", registration: REGISTRATION_NONE,
      attendanceNote: "No registration required. Children under 10 must be accompanied by an adult.",
    },
  },
  {
    date: "2026-11-17",
    url: "https://events.sjsu.edu/event/de-risking-for-startups-through-partnerships-hosted-by-emumba-x-silicon-valley-sbdc-x-aws",
    facts: { cost: "free", endTime: "8:00 PM" },
  },
  // Both team schedules still say TBA. The ticket shop's JSON-LD 7 PM
  // placeholder is not an announced kickoff. Reverify the team schedule
  // before releasing this dated hold; retained URLs must also lose the clock.
  {
    date: "2026-11-28",
    matches: (event) => /\bfootball\b.*\bSMU\b/i.test(event.title || "")
      && /^https:\/\/tickets\.gostanford\.com\/(?:events?\/football-vs-smu-fauvdl|events\/69c4649c39baf6e77d7c9b7f\/(?:6ae10caa2652b89aac76ea31|6ada9e67bf5c964ef46db282))(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      time: null, endTime: null,
      description: "Stanford hosts SMU at Stanford Stadium on November 28. Kickoff time is TBA on Stanford's official football schedule; the ticket shop's structured clock is unconfirmed.",
      blurb: "Stanford hosts SMU at Stanford Stadium on November 28; kickoff time is TBA.",
    },
  },
  // The current venue page and its exact, rescheduled ticket record disagree.
  // Neither establishes a single confirmed clock. Keep the concert with a
  // visible source-conflict notice, without borrowing either clock in backfill.
  {
    date: "2026-12-06",
    url: "https://www.sapcenter.com/events/detail/rush-2",
    aliasUrls: ["https://www.ticketmaster.com/rush-fifty-something-san-jose-california-12-06-2026/event/1C006355EC78A84D"],
    facts: {
      time: null, endTime: null, category: "music", attendanceStatus: "needs-confirmation",
      attendanceNote: "SAP Center lists 7 PM; Ticketmaster lists 7:30 PM for this rescheduled concert. Confirm the start with the venue before going.",
    },
  },
  // Sparse newsletter copies won deduplication without the organizer's entry
  // terms. Keep these exact dated occurrences consistent with the full ticket
  // records and the city's original bulletin, including retained cards.
  // Evidence: docs/qa/2026-11-07-0507z-fact-check.md.
  {
    date: "2026-11-08",
    matches: (event) => /^https:\/\/www\.eventbrite\.com\/e\/49ers-vs-raiders-the-ultimate-football-watch-party-at-fuze-tickets-2003954792730(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      cost: "low", costNote: "$5 in advance; $10 at the door.",
      kidFriendly: false, audienceAge: "adult", sourceAudiences: ["Adults, ages 21+"],
      attendanceNote: "Ages 21+. Tickets are $5 in advance or $10 at the door.",
    },
  },
  {
    date: "2026-11-08",
    url: "https://improv.com/sanjose/comic/tyler+fischer/",
    aliasUrls: ["https://www.ticketweb.com/event/tyler-fischer-san-jose-improv-tickets/14934463"],
    facts: {
      cost: "paid", kidFriendly: false, audienceAge: "adult", sourceAudiences: ["Adults, ages 21+"],
      attendanceNote: "Ages 21+. The showroom requires a two-item minimum purchase per person.",
    },
  },
  {
    date: "2026-11-13",
    matches: (event) => /^https:\/\/anc\.apm\.activecommunities\.com\/santaclara\/activity\/search\/detail\/30217(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Pre-registration is required. For elementary school children.",
    },
  },
  // Exact first-party occurrence body says registration is recommended but
  // not required. Its enabled seat form alone does not establish a mandate.
  // Preserve a subsequent explicit closed/full state or changed requirement.
  // Evidence: docs/qa/2026-11-07-0107z-fact-check.md.
  {
    date: "2026-11-10",
    matches: (event) => event.url === "https://sjpl.bibliocommons.com/events/6a85eceebe14820029887e87"
      && /\bregistration\s+(?:is\s+)?recommended\s+but\s+not\s+required\b/i.test(sourceText(event))
      && !/\bregistration\s+(?:is\s+)?(?:required|mandatory)\b|\bmust\s+(?:register|reserve|book)\b/i.test(sourceText(event))
      && ![REGISTRATION_FULL, REGISTRATION_CLOSED, REGISTRATION_APPOINTMENT].includes(event.registration),
    facts: { registration: REGISTRATION_NONE, registrationClosesBy: null, attendanceNote: "Registration is recommended but not required." },
  },
  // The received county notice names this observance, clock and place. It
  // does not establish who organizes the whole parade or who will march.
  {
    date: "2026-11-11",
    matches: (event) => event.source === "City Newsletter" && event.city === "san-jose"
      && /^MOAA Silicon Valley Veterans Day Parade & Ceremony$/i.test(event.title || ""),
    facts: {
      title: "MOAA Silicon Valley Veterans Day Parade & Ceremony",
      description: "Veterans Day parade and ceremony in downtown San Jose, listed in Supervisor Otto Lee's community newsletter.",
      blurb: "Attend the MOAA Silicon Valley Veterans Day parade and ceremony in downtown San Jose.",
    },
  },
  // The current organizer records put booking instructions outside the short
  // display excerpt. Preserve the verified dates when cached cards are read.
  // Evidence: docs/qa/2026-11-06-2007z-fact-check.md.
  {
    date: "2026-11-07",
    url: "https://events.stanford.edu/event/16th-bita-prize-for-persian-arts-celebrating-sima-bina",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free ticket required.",
    },
  },
  {
    date: "2026-11-14",
    url: "https://www.gamblegarden.org/event/novembersaturday/",
    facts: {
      cost: "free",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Register for timed entry at 10:00 AM, 10:30 AM, or 11:00 AM. All Second Saturday guests, when you arrive, please check in at one of our two Welcome Tables in order to enjoy the Second Saturday tours and special activities.",
    },
  },
  // Broadway San Jose renamed this single November 27, 7 PM concert. Its
  // performance table marks that same booking as ASL interpreted; Ticketmaster
  // still carries the old title. Align identity before deduplication and keep
  // the access detail on the surviving first-party card.
  // https://broadwaysanjose.com/shows/the-carpenters-songbook-at-christmas/
  // Evidence: docs/qa/2026-11-06-1307z-fact-check.md.
  {
    date: "2026-11-27",
    url: "https://www.sanjose.org/theaters/events/carpenters-songbook-christmas",
    aliasUrls: ["https://www.ticketmaster.com/the-carpenters-songbook-a-live-celebration-san-jose-california-11-27-2026/event/1C0064E1DECF3956"],
    facts: {
      title: "The Carpenters Songbook: At Christmas",
      venue: "Center for the Performing Arts",
      attendanceNote: "ASL interpretation is available for this performance.",
    },
  },
  // Fresh organizer pages confirm the acronym and farm eligibility omitted by
  // sparse source excerpts. Preserve these reviewed dates in cached cards too.
  // Evidence: docs/qa/2026-11-06-1007z-fact-check.md.
  {
    date: "2026-11-16",
    url: "https://events.sjsu.edu/event/eci-speaker-series-featuring-dr-heidi-emberling",
    facts: { title: "ECI Speaker Series Featuring Dr. Heidi Emberling" },
  },
  {
    date: "2026-11-07",
    url: "https://events.stanford.edu/event/copy-of-volunteering-at-the-stanford-educational-farm",
    facts: {
      attendanceNote: "We welcome volunteers 10 years old and older. Those between 10 and 14 years old are required to have a guardian actively volunteering alongside them for the duration of the volunteer session.",
    },
  },
  // The newly added occurrences were checked against full organizer records.
  // Keep sparse/cached rows and retired pages consistent with those records.
  // Evidence: docs/qa/2026-11-06-0607z-fact-check.md.
  {
    date: "2027-01-16",
    url: "https://www.ticketmaster.com/harlem-globetrotters-rivalry-tour-presented-by-san-jose-california-01-16-2027/event/1C00650CF372571B",
    facts: { category: "sports" },
  },
  {
    date: "2026-11-11",
    url: "https://events.scu.edu/library/event/521864-find-your-space-in-the-library",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "SCU addresses this library orientation to commuter and transfer students. Confirm public eligibility with the organizer before attending.",
    },
  },
  // Full organizer records reviewed November 5, including the hash-verified
  // retained Stanford response. Sparse excerpts omit attendance restrictions.
  // Evidence: docs/qa/2026-11-06-0507z-fact-check.md.
  {
    date: "2026-11-11",
    url: "https://events.scu.edu/leavey-school-of-business/event/525136-dnaxai-series-demo-day-see-it-try-it-use-it-ai",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer addresses this workshop to Leavey faculty and asks for an RSVP by November 9. Confirm public eligibility with SCU before attending.",
    },
  },
  {
    date: "2027-01-16",
    url: "https://www.ticketmaster.com/mvp-court-pass-check-in-by-san-jose-california-01-16-2027/event/1C00650BEAA35A61",
    facts: {
      attendanceNote: "This optional pregame upgrade requires a separate Harlem Globetrotters game ticket. It is not admission to the main event.",
    },
  },
  {
    date: "2026-11-06",
    url: "https://events.stanford.edu/event/omac-first-fridays",
    facts: {
      category: "community",
      venue: "EVGR Pub & Beer Garden",
      description: "The Office for Military-Affiliated Communities hosts a social gathering for military-affiliated community members, including veterans and families, at EVGR Pub & Beer Garden.",
      blurb: "Military-affiliated community members can meet at EVGR Pub & Beer Garden for OMAC's First Friday gathering.",
      attendanceNote: "Open to military-affiliated community members, including veterans and families.",
    },
  },
  {
    date: "2026-11-06",
    url: "https://events.stanford.edu/event/first-fridays-at-ida-social",
    facts: { title: "First Fridays at IDA (Social)" },
  },
  {
    date: "2026-11-07",
    url: "https://sunnyvale.libcal.com/event/17603300",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Registration is required; walk-ins are welcome if space remains. Supplies are limited. For teens in grades 6–12.",
    },
  },
  // These two newsletter titles point to Santa Clara's same numbered
  // November 5 calendar event, at the same time in the same library room.
  // Normalize before URL deduplication and when resolving retired aliases.
  {
    date: "2026-11-05",
    url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114903/",
    aliasUrls: ["https://www.sclibrary.org/Home/Components/Calendar/Event/114903/7953?curm=11&cury=2026"],
    facts: { url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114903/" },
  },
  // Organizer records and ticket pages reviewed November 5. Apply these
  // before URL deduplication so sparse newsletter copies cannot reappear.
  // Evidence: docs/qa/2026-11-06-0207z-fact-check.md.
  {
    date: "2026-11-06",
    url: "https://events.stanford.edu/event/ewear-health-prize-stanford-u-2026",
    facts: { category: "education" },
  },
  {
    date: "2026-11-08",
    url: "https://tickets.gostanford.com/events/womens-basketball-vs-uc-davis-xp06qg",
    aliasUrls: ["https://www.espn.com/watch/player/_/eventCalendarId/401915979?gameId=401915979&sourceLang=en&om-navmethod=espn%3Aglobalsearch%3Aresults"],
    facts: {
      url: "https://tickets.gostanford.com/events/womens-basketball-vs-uc-davis-xp06qg",
      venue: "Maples Pavilion",
      address: "655 Campus Drive, Stanford, CA 94305",
    },
  },
  {
    date: "2026-11-08",
    url: "https://tickets.gostanford.com/events/acc-mens-soccer-championship-quarterfinals-1yr8bl",
    facts: { address: "641 Nelson Road, Stanford, CA 94305" },
  },
  {
    date: "2026-11-10",
    url: "https://events.scu.edu/leavey-school-of-business/event/521785-queer-qualified-networking-101",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "SCU labels this a Student Organizations / Undergraduate Business workshop. Confirm public eligibility with the organizer before attending.",
    },
  },
  {
    date: "2026-11-10",
    url: "https://events.scu.edu/library/event/521863-find-your-space-in-the-library",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "SCU addresses this library orientation to commuter and transfer students. Confirm public eligibility with the organizer before attending.",
    },
  },
  // A live library edit moved the header to 2–3:30 PM but retained a
  // two-hour claim in the body. Preserve the published clocks and optional
  // signup, disclose the conflict, and never invent a 4 PM finish. Stop
  // qualifying a fresh occurrence when either side of the conflict changes.
  // Evidence: docs/qa/2026-11-05-2207z-fact-check.md.
  {
    date: "2026-12-19",
    matches: (event) => /^https:\/\/paloalto\.bibliocommons\.com\/(?:v2\/)?events\/6ad7a697295d793e2d1803ec\/?$/.test(event.url || "")
      && event.time === "2:00 PM" && event.endTime === "3:30 PM"
      && /\btwo[-\s]hour concert\b/i.test(event.description || ""),
    facts: {
      registration: REGISTRATION_NONE, registrationClosesBy: null, attendanceStatus: "needs-confirmation",
      attendanceNote: "The library lists 2–3:30 PM, while its description calls this a two-hour concert. Confirm the finish with Rinconada Library. Registration is not required; optional signup provides a reminder email the day before.",
      blurb: "Hear Nathan's Fearless Five perform in Rinconada Library's Embarcadero Room.",
    },
  },
  // The published reminder URLs must resolve to the verified programs too.
  // Scope these date corrections to the exact reviewed 2026 source rows;
  // never infer another program from a reused title or future calendar year.
  ...["2026-11-05", "2026-11-06"].map(date => ({
    date, url: "https://events.sjsu.edu/event/campus-reading-program-november-9-events",
    facts: { ...SJSU_NOVEMBER_READING, date: "2026-11-09", displayDate: "Mon, Nov 9" },
  })),
  ...["2026-11-05", "2026-11-06", "2026-11-09"].map(date => ({
    date, url: "https://events.sjsu.edu/event/silent-movie-classic-with-live-score-performance-dont-miss-it",
    facts: { ...SJSU_NOVEMBER_METROPOLIS, date: "2026-11-10", displayDate: "Tue, Nov 10" },
  })),
  // The live listing now identifies only the one-hour discussion and names
  // campus audiences. Do not restore the former combined discussion/film
  // card through sparse snapshots or retired URLs. Public access is unconfirmed.
  // Evidence: docs/qa/2026-11-06-0007z-fact-check.md.
  {
    date: "2026-11-09", url: "https://events.sjsu.edu/event/campus-reading-program-november-9-events",
    facts: SJSU_NOVEMBER_READING,
  },
  // The full Stanford body requires registration and gives a November 3
  // deadline, both lost by excerpt truncation. Do not invent a cutoff clock
  // or claim a late booking is available.
  {
    date: "2026-11-06", url: "https://events.stanford.edu/event/knight-initiative-rosenkranz-aging-joint-symposium",
    facts: {
      category: "education", cost: "free", registration: REGISTRATION_REQUIRED, attendanceStatus: "needs-confirmation",
      attendanceNote: "Free; registration is required. The organizer asks attendees to register by November 3. Confirm late registration with the organizer before going.",
    },
  },
  {
    date: "2026-11-06", url: "https://events.stanford.edu/event/artificial-intelligence-regulatory-policy-landscapes",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Online via Zoom. Register through ALA-GODORT's Friday Chats page to receive the link.",
    },
  },
  // The broad calendar tags conflict with the explicitly named campus
  // audience. The shared suppression withholds this occurrence; keep its
  // retired leaf and sparse copies qualified without claiming cancellation.
  {
    date: "2026-11-06", url: "https://events.stanford.edu/event/collab-lab-nov6",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The description invites Stanford faculty, staff and students, while the calendar audience tags say General Public and Everyone. Confirm public eligibility with the organizer.",
    },
  },
  // The museum's November 7 celebration starts at 10 AM; 10:40 is its first
  // performance, which newsletter intake mistook for the event's start.
  // Normalize both newsletter copies and the calendar listing before dedup.
  // https://www.cdm.org/event/diwali/
  // Evidence: docs/qa/2026-11-05-1707z-fact-check.md.
  {
    date: "2026-11-07",
    title: /^Diwali(?:: Festival of Lights| Cultural Celebration)$/i,
    venue: /^Children's Discovery Museum(?: of San Jose)?(?:,|$)/i,
    facts: {
      title: "Diwali: Festival of Lights",
      time: "10:00 AM", endTime: "3:30 PM",
      venue: "Children's Discovery Museum",
      address: "180 Woz Way, San Jose, CA 95110",
      url: "https://www.cdm.org/event/diwali/",
      cost: "paid",
      blurb: "Celebrate Diwali with lamp-making, Rangoli art, storytelling, music and dance at the Children's Discovery Museum.",
    },
  },
  // The dated organizer page and its Event schema confirm this storytime's
  // place and clocks, but do not name a book. Keep the verified occurrence
  // without the unconfirmed book/author claim or subscriber tracking URL.
  // https://www.cdm.org/event/all-ages-storytime-2-2/2026-11-10/
  // Evidence: docs/qa/2026-11-05-1707z-fact-check.md.
  {
    date: "2026-11-10",
    title: /^All Ages Storytime(?:: Chugga Chugga Choo Choo)?$/i,
    venue: /^Brandenburg Theatre(?:, Children's Discovery Museum of San Jose(?:,|$)|$)/i,
    facts: {
      title: "All Ages Storytime",
      time: "11:30 AM", endTime: "12:00 PM",
      url: "https://www.cdm.org/event/all-ages-storytime-2-2/2026-11-10/",
      description: "All-ages storytime in the museum's Lee & Diane Brandenburg Theatre.",
      blurb: "Join an all-ages storytime in the museum's Brandenburg Theatre.",
    },
  },
  // This occurrence's booking panel conflicts with its no-registration prose.
  // Preserve the gate, disclose the conflict, and use the current published
  // November 7, 4 PM deadline rather than the stale November 5 cutoff.
  // Evidence: docs/qa/2026-11-05-1007z-fact-check.md.
  {
    date: "2026-11-07", url: "https://sjpl.bibliocommons.com/events/6a3ec53af56bd86e00b94805",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a3ec53af56bd86e00b94805"],
    facts: {
      registrationClosesBy: "2026-11-08T00:00:00.000Z",
      attendanceStatus: "needs-confirmation",
      attendanceNote: "Ages 8–14. The library's booking panel requires registration, while its description says no registration is required. Confirm attendance requirements with Almaden Library before going.",
    },
  },
  // The organizer separates Sunday's 11am–2pm bag sale from its 2–4pm
  // bulk sale. The newsletter merged their hours; protect this occurrence
  // before intake normalization and cached blurb refresh, without creating
  // another sale or changing the Saturday members/public schedule.
  // https://mvlibraryfriends.org/book-sales/
  // Evidence: docs/qa/2026-11-05-0907z-fact-check.md.
  {
    date: "2026-11-08",
    matches: (event) => /^Friends of the Library Book Sale \(Bag Sale\)$/i.test(event.title || "")
      && /^Bookmobile garage on Mercy Street(?:, next to the Mountain View Public Library underground parking lot)?$/i.test(event.venue || "")
      && (event.city === "mountain-view" || /Mountain View Public Library/i.test(event.venue || "")),
    facts: {
      endTime: "2:00 PM", url: "https://mvlibraryfriends.org/book-sales/",
      attendanceNote: "Fill-a-Bag Sale ends at 2 PM. A separate bulk sale runs 2–4 PM at $1 per foot length.",
    },
  },
  // The staff can speak Vietnamese; the club practices beginner English.
  // The two exact organizer records share this description. Protect their
  // cached blurb without projecting additional dates or changing attendance.
  // Evidence: docs/qa/2026-11-05-0507z-fact-check.md.
  ...[
    ["2026-11-06", "6a50271ecca66c2f00a26762"],
    ["2026-11-07", "6a751bec3f18b57d5233feb7"],
  ].map(([date, id]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${id}`,
    aliasUrls: [`https://sjpl.bibliocommons.com/v2/events/${id}`],
    facts: { blurb: "Practice beginner English conversation with library staff who speak Vietnamese at Seven Trees Library." },
  })),
  // The complete organizer credit names Lan A. Li. The preview normalizer
  // previously treated the initial as a sentence end and the cached blurb
  // copied that incomplete name. Protect the existing dated occurrence.
  // https://events.stanford.edu/event/no-ideas-but-in-things
  // Evidence: docs/qa/2026-11-05-0407z-fact-check.md.
  {
    date: "2026-11-05", url: "https://events.stanford.edu/event/no-ideas-but-in-things",
    facts: {
      description: "Short film screening of No Ideas But in Things, filmed and directed by Lan A. Li and produced by Peter N. Miller, followed by a discussion with the filmmakers.",
      blurb: "Watch No Ideas But in Things, filmed and directed by Lan A. Li, followed by a discussion with the filmmakers.",
    },
  },
  // The full organizer directions name the East Wing's IC Classroom, while
  // Localist's location names Bing Wing. Keep only their shared building and
  // require confirmation rather than choosing between conflicting wings.
  // Evidence: docs/qa/2026-11-04-1607pt-fact-check.md.
  {
    date: "2026-11-05", url: "https://events.stanford.edu/event/critical-carceral-studies-special-collections-coffee",
    facts: {
      venue: "Green Library", address: "", attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's detailed directions name the IC Classroom (East Wing), while its location header names Bing Wing. Confirm the meeting point with the organizer when you RSVP.",
    },
  },
  // Keep the retired URL honest too: this is a professional meeting with
  // restricted eligibility and internally inconsistent year/location details,
  // not a public music performance. Never select a replacement date or venue.
  // Evidence: docs/qa/2026-11-04-1607pt-fact-check.md.
  ...["2026-11-05", "2026-11-06"].map(date => ({
    date, url: "https://events.stanford.edu/event/music-library-association-california-chapter-annual-meeting",
    facts: {
      category: "education", attendanceStatus: "needs-confirmation",
      description: "Professional meeting for Music Library Association California Chapter meeting registrants. Public eligibility, dates and meeting points need confirmation with the organizer.",
      blurb: "Professional Music Library Association meeting; confirm eligibility, dates and meeting points with the organizer.",
      attendanceNote: "The organizer lists Members and meeting registrants. Its agenda uses 2025 while the calendar uses 2026; the first-day tour names Braun Music Center while the event location says Hohbach Hall. Confirm eligibility, dates and meeting points with the organizer.",
    },
  })),
  // The venue's concert calendar also carries non-concert events. Its exact
  // December 5 record describes pet adoption, vendors and Santa photos,
  // welcomes all ages and supplies the 11am–3pm window. Do not infer free
  // admission from the calendar's $0 price placeholders beside ticket sales.
  // Evidence: docs/qa/2026-11-04-1607pt-fact-check.md.
  {
    date: "2026-12-05", url: "https://www.mountainwinery.com/events/detail?event_id=1683714",
    aliasUrls: ["https://www.mountainwinery.com/events/detail/?event_id=1683714"],
    facts: { category: "community", endTime: "3:00 PM", kidFriendly: true },
  },
  // The event has a stray 7 after its phone link; the publisher's independent
  // accessibility page confirms (408) 540-3947 for help with the same form.
  // Match only this occurrence and known token, including normalized spacing.
  // Preserve changed contacts and every other event/attendance fact.
  // https://sccld.org/accessibility/
  // Evidence: docs/qa/2026-11-04-origami-contact.md.
  {
    date: "2026-11-19", url: "https://sccl.bibliocommons.com/events/6ae2292c0b801373af915568",
    aliasUrls: ["https://sccl.bibliocommons.com/v2/events/6ae2292c0b801373af915568"],
    copyReplacements: [[/\(408\) 540-3947\s*7(?=, or email us at )/g, "(408) 540-3947"]],
  },
  // The organizer explicitly says signup is requested but not required.
  // This occurrence's capped form and deadline govern optional signup only;
  // keep the exception dated rather than relaxing other libraries' gates.
  // Evidence: docs/qa/2026-11-04-2007z-fact-check.md.
  {
    date: "2026-11-07", url: "https://sjpl.bibliocommons.com/events/6a3f10c0f56bd86e00b95e6b",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a3f10c0f56bd86e00b95e6b"],
    facts: {
      registration: REGISTRATION_NONE, registrationClosesBy: null,
      attendanceNote: "Registration is requested but not required.",
    },
  },
  // The complete RSS item and dated organizer page require preregistration;
  // the short excerpt loses it. Bind the access condition to this occurrence
  // so blurb refreshes retain it without reopening full or closed registration.
  // https://events.sjsu.edu/event/the-ethical-stakes-of-being-a-public-scholar
  // Evidence: docs/qa/2026-11-04-1107z-fact-check.md.
  {
    date: "2026-11-13", url: "https://events.sjsu.edu/event/the-ethical-stakes-of-being-a-public-scholar",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Pre-registration is required. Sign up through the organizer's linked form for this online conversation.",
    },
  },
  // The dated organizer page explicitly welcomes families and all ages.
  // Keep the public occurrence consistent with the curated recurring entry.
  // https://www.southfirstfridays.com/ (November 6, 2026 announcement)
  // Evidence: docs/qa/2026-11-04-0407z-fact-check.md.
  {
    date: "2026-11-06", url: "https://www.southfirstfridays.com/",
    facts: { kidFriendly: true },
  },
  // This listing's savings/spending records have no statistic, measurement
  // period or supporting citation. Retain the workshop facts, not that claim.
  // Match both original and polished copy so refreshes cannot restore it.
  // Evidence: docs/qa/2026-11-04-0407z-fact-check.md.
  {
    date: "2026-11-07", url: "https://sjpl.bibliocommons.com/events/6a3d7a8b6db61d280097f448",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a3d7a8b6db61d280097f448"],
    copyReplacements: [
      [/\bThere are record lows in savings(?:,| and) record highs? in spending, and (?:young adults are )?stepping into adulthood without (?:the )?foundational education in personal finance\.\s*/gi, ""],
    ],
  },
  // The comedian's biography mentions parenting and family; that does not
  // establish a children's show. The dated show page sells admission and
  // publishes no exception to the venue's standard 21+ entry policy.
  // https://improv.com/sanjose/comic/px+floro/ and /sanjose/info/
  {
    date: "2026-11-04", url: "https://improv.com/sanjose/comic/px+floro/",
    facts: {
      kidFriendly: false, audienceAge: "adult", cost: "paid",
      attendanceNote: "San Jose Improv's standard entry policy is 21+ unless a show specifies otherwise. Valid photo ID and a two-item minimum apply; check the ticket listing for any show-specific age exception.",
    },
  },
  // Full organizer records supply attendance conditions omitted by excerpts.
  // Keep the RSVP request distinct from an unverified closed/full status.
  // Evidence: docs/qa/2026-11-04-0307z-fact-check.md.
  {
    date: "2026-11-04", url: "https://events.stanford.edu/event/stanford-in-haus-cramer-a-berlin-microhistory-book-launch-and-reception",
    facts: {
      attendanceNote: "RSVP requested. The organizer asked for responses by October 26 and notes limited seating; confirm availability with the organizer before going.",
    },
  },
  {
    date: "2026-11-18", url: "https://www.eventbrite.com/e/hands-only-cpr-and-aed-class-15-monte-sereno-15-hrs-2026-tickets-2004328931790",
    facts: {
      endTime: "11:30 AM",
      attendanceNote: "Ages 13+ who live or work in County Fire's service area: Campbell, Cupertino, Los Gatos, Monte Sereno, San Martin, Saratoga, Los Altos, Los Altos Hills and surrounding unincorporated areas. Participants under 18 need a signed parent or guardian liability waiver. This class does not provide certification.",
    },
  },
  // The dated member briefing is withheld from the public calendar. Its old
  // URL still resolves as a retired leaf, which must not repeat the calendar
  // card's invented physical location. Preserve the verified access there too.
  // Evidence: docs/qa/2026-11-03-2307z-fact-check.md.
  {
    date: "2026-11-06", url: "https://www.eventbrite.com/e/post-election-svlg-member-briefing-tickets-2003679941643",
    facts: {
      virtual: true, venue: "Online (Zoom)", address: "",
      description: "Online election-results briefing for employees of SVLG member companies. Registration provides the Zoom link.",
      blurb: "Online election-results briefing for employees of SVLG member companies.",
    },
  },
  // Public audience tags apply to Zoom; the organizer expressly limits the
  // physical room to Stanford faculty, researchers, students and staff.
  // Keep cached copy from directing the public to Encina Hall.
  // Evidence: docs/qa/2026-11-03-2307z-fact-check.md.
  {
    date: "2026-11-04", url: "https://events.stanford.edu/event/the-rise-and-fall-of-tunisian-democracy-populism-polarization-and-the-perils-of-power-sharing",
    facts: {
      virtual: true, venue: "Online (Zoom)", address: "",
      attendanceNote: "Public attendance is via Zoom. In-person attendance is limited to Stanford faculty, researchers, students and staff. Register through the organizer for the Zoom link.",
      description: "Political scientist Sharan Grewal discusses Tunisia's democratic transition and collapse, and the risks of prolonged power-sharing.",
      blurb: "Join Sharan Grewal online for a talk about Tunisia's democratic transition and the risks of power-sharing.",
    },
  },
  // The organizer confirms these 2026 occurrences, but its Book Now links
  // open December 2023/2024 calendars. Use the current dated source instead.
  // https://historysanjose.org/programs-events/ (verified November 3, 2026)
  ...[
    ["2026-12-11", /^Gingerbread Village Workshop$/i],
    ["2026-12-19", /^History Park Heritage Holiday$/i],
  ].map(([date, title]) => ({
    date, title, venue: /^History Park(?:, Empire Firehouse)?$/i,
    facts: { url: "https://historysanjose.org/programs-events/" },
  })),
  // The authenticated November 2 city newsletter announces open registration;
  // it does not establish mandatory advance signup. Keep that distinction in
  // retained intake copies as well as future publication of these exact dates.
  // Evidence: docs/qa/2026-11-03-0507z-fact-check.md.
  // Its public bulletin also confirms family audiences and the announced
  // resident/nonresident fees, not current seat availability. Keep the copy
  // repair in this same first-match rule.
  // https://content.govdelivery.com/accounts/CASANTACLARA/bulletins/4311a7c
  // Follow-up: docs/qa/2026-11-08-1007z-fact-check.md.
  ...[
    ["2026-12-12", "29965", { kidFriendly: true, cost: "paid", costNote: "Announced fees: residents $25; nonresidents $31." }],
    ["2026-12-17", "29964", { category: "family", kidFriendly: true, cost: "paid", costNote: "Announced fees: residents $20; nonresidents $25." }],
  ].map(([date, activity, facts]) => ({
    date,
    url: `https://anc.apm.activecommunities.com/santaclara/activity/search/detail/${activity}?onlineSiteId=0&from_original_cui=true`,
    facts,
    copyReplacements: [[/\bRegistration required;/g, "Registration was announced as open;"]],
  })),
  // The organizer's current RSVP form resolves the newsletter's Saturday typo:
  // Friday, November 13 at 6 PM, San Pedro Square Market. Exclusive autographs
  // are for season ticket holders; the general rally is not described as restricted.
  // Evidence: docs/qa/2026-11-03-0307z-fact-check.md.
  {
    date: "2026-11-13", url: "https://sjearthquakes.formstack.com/forms/quakes_playoff_rally",
    facts: {
      venue: "San Pedro Square Market",
      attendanceNote: "RSVP through the organizer's form. Exclusive player autographs are for season ticket holders, including new 2027–28 season ticket holders.",
    },
    copyReplacements: [
      ["Fan rally to celebrate the Earthquakes' regular season and kick off the 2026 MLS Cup Playoffs, with players expected to attend. The email says 'Saturday, November 13', but November 13, 2026 is a Friday, so the date or weekday may be wrong. RSVP requested.", "Fan rally at San Pedro Square Market to celebrate the Earthquakes' regular season and kick off the 2026 MLS Cup Playoffs. The organizer's RSVP form confirms Friday, November 13 at 6 PM."],
      [/\bat San Pedro Square to celebrate\b/g, "at San Pedro Square Market to celebrate"],
    ],
  },
  // The full LiveWhale body supplies the room and mandatory signup omitted
  // by RSS's empty excerpt. Keep admission unknown and preserve stronger
  // booking states if the organizer later closes or fills registration.
  {
    date: "2026-11-05", url: "https://events.scu.edu/leavey-school-of-business/event/524992-gbp-mssb-fireside-chat-sf-giants",
    aliasUrls: ["https://events.scu.edu/live/events/524992-gbp-mssb-fireside-chat-sf-giants"],
    facts: {
      title: "GBP & MSSB Fireside Chat: SF Giants",
      venue: "Lucas Hall", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Room 209. Registration is required through the organizer's linked form for this in-person career talk with SF Giants VP of People & Culture Lan Huynh Lee.",
    },
  },
  // The public audience tags describe Zoom access, not the physical room.
  // The exact occurrence page and restricted_to field agree on that limit;
  // its page also explicitly says Free Event despite Localist's false flag.
  // Evidence: docs/qa/2026-11-02-2207z-fact-check.md.
  {
    date: "2026-11-03", url: "https://events.stanford.edu/event/book-talk-we-shall-outlast-them-putins-global-campaign-to-defeat-the-west",
    facts: {
      virtual: true, venue: "Online (Zoom)", address: "", cost: "free",
      attendanceNote: "Public attendance is via Zoom. In-person attendance is limited to Stanford faculty, students and staff. Registration is offered through the organizer's linked page.",
    },
  },
  // The source asks for RSVP by November 1 to plan attendance. That elapsed
  // request does not prove closed admission. Do not guess between the room
  // field's Courtroom and the full body's Couchroom; preserve the building.
  {
    date: "2026-11-03", url: "https://events.stanford.edu/event/wellness-series-elections-processing-space",
    facts: {
      cost: "free", attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer requested RSVP by November 1 at 11:59 PM Pacific. Confirm late attendance and the meeting room with the Asian American Activities Center before going.",
    },
  },
  // The exact library occurrence is Wednesday, November 18; its shared body
  // still advertises a Thursday cadence and misdates Theft. Both publishers
  // date the novel to March 18, 2025. Correct source and cached copy together.
  // https://www.bloomsbury.com/uk/theft-9781526678645/
  // Evidence: docs/qa/2026-11-02-2207z-fact-check.md.
  {
    date: "2026-11-18", url: "https://sccl.bibliocommons.com/events/6ab592174852aa18b5b0a4fc",
    aliasUrls: ["https://sccl.bibliocommons.com/v2/events/6ab592174852aa18b5b0a4fc"],
    copyReplacements: [
      [/\b2022 novel Theft\b/g, "2025 novel Theft"],
      // Prose normalization leaves the source comma in place; copy editing
      // removes it later. Match both stages so the final pass cannot revive it.
      [/The Adult Book Discussion Group meets twice a month, on the third Thursday morning at 11 am,? and on the third Thursday evening at 7 PM\.\s*/g, ""],
      [/Both meetings are held in Room 201B\./g, "Meetings are held in Room 201B."],
    ],
  },
  // The independently verified evening occurrence repeats the same wrong
  // publication year. Its Thursday schedule is accurate; correct only the
  // book year in source/cached copy, keeping the occurrence and access fields.
  // Publisher: https://www.penguinrandomhouse.com/books/763656/theft-winner-of-the-nobel-prize-in-literature-by-abdulrazak-gurnah/
  // Evidence: docs/qa/2026-11-08-0507z-fact-check.md.
  {
    date: "2026-11-19", url: "https://sccl.bibliocommons.com/events/6ab5925ced69cc15475c5a98",
    aliasUrls: ["https://sccl.bibliocommons.com/v2/events/6ab5925ced69cc15475c5a98"],
    copyReplacements: [[/\b2022 novel Theft\b/g, "2025 novel Theft"]],
  },
  // The city's November 2 original and rendered activity page confirm a paid,
  // registered children's session. The newsletter path omitted its badges.
  // Evidence: docs/qa/2026-11-02-1807z-fact-check.md.
  {
    date: "2026-12-12", url: "https://anc.apm.activecommunities.com/mountainviewrecreation/activity/search/detail/19245?onlineSiteId=0&from_original_cui=true",
    facts: {
      cost: "paid", registration: REGISTRATION_REQUIRED, kidFriendly: true, audienceAge: "kids",
      costNote: "Material fees are included in the price. Check the city's activity page for current fees.",
      attendanceNote: "For ages 6–11. Register through the city's activity page. Held in Redwood Hall at the Mountain View Community Center.",
    },
  },
  // First-party November 2 source review: the public film and award ceremony
  // explicitly offer free admission. The calendar's 4 PM award start includes
  // food; the ceremony itself begins at 4:30 PM. Do not move the whole event.
  // Evidence: docs/qa/2026-11-02-1007z-fact-check.md.
  {
    date: "2026-11-10", url: "https://events.sjsu.edu/event/humhonculturecon-movie-event-metropolis-1927",
    // The Campus Reading Program's second announcement advertises this same
    // screening. Normalize it before deduplication. Its poster's 6:30 PM
    // finish conflicts with the canonical page's 6 PM; neither establishes
    // an unqualified finish. Preserve the shared 3:30 PM start and Room 225.
    // Evidence: docs/qa/2026-11-06-0007z-fact-check.md.
    aliasUrls: ["https://events.sjsu.edu/event/silent-movie-classic-with-live-score-performance-dont-miss-it"],
    facts: SJSU_NOVEMBER_METROPOLIS,
  },
  {
    date: "2026-11-10", url: "https://events.sjsu.edu/event/hearst-award-camille-zapata",
    facts: {
      cost: "free",
      attendanceNote: "Food begins at 4 PM; the award ceremony begins at 4:30 PM. Admission is free and open to all; RSVP through SJSU's linked form.",
    },
  },
  // The authenticated city originals retain the signup requirement and the
  // senior trip's age/price restrictions omitted by the extracted records.
  {
    date: "2026-11-14", url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/111020/",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Space is limited. Registration is required through the county Cooperative Extension's linked workshop page.",
    },
  },
  {
    date: "2026-12-17", url: "https://anc.apm.activecommunities.com/sunnyvaleactivities/activity/search/detail/3059?onlineSiteId=0&locale=en-US&from_original_cui=true",
    facts: {
      cost: "paid", audienceAge: "adult", registration: REGISTRATION_REQUIRED,
      attendanceNote: "For ages 50 and older. $111 for residents or $139 for nonresidents; lunch is not included. Register online, at the Senior Center, or by calling 408-730-7360.",
    },
  },
  // The concert page and its own ticket occurrence confirm December 10 at
  // 7:30 PM. Preserve the music category and paid ticketing for every alias.
  {
    date: "2026-12-10", url: "https://montalvoarts.org/experience/carriage-house-concerts/irish-christmas-2/",
    aliasUrls: [
      "https://montalvoarts.org/experience/carriage-house-concerts/irish-christmas-2/?promo=",
      "https://my.montalvoarts.org/3113/3157",
    ],
    facts: { category: "music", cost: "paid" },
  },
  // The marketing page and its linked ticket occurrence agree on 7:30 PM;
  // 5:30 PM belongs to the separate pre-concert gallery exhibition. The
  // marketing page also corrects the ticket calendar's "Amaan Ayaan" typo.
  // Normalize both adapters before deduplication, not just the winning card.
  // Evidence: docs/qa/2026-11-02-0107z-fact-check.md.
  {
    date: "2026-11-14",
    url: "https://montalvoarts.org/experience/carriage-house-concerts/the-sarod-trilogy/",
    aliasUrls: ["https://my.montalvoarts.org/3109/3152"],
    facts: {
      title: "The Sarod Trilogy: Amjad Ali Khan, Amaan Ali Bangash, and Ayaan Ali Bangash",
      time: "7:30 PM", category: "music", cost: "paid",
      blurb: "Hear Amjad Ali Khan and his sons Amaan Ali Bangash and Ayaan Ali Bangash perform Indian classical music on sarod.",
    },
  },
  // The authenticated November 1 Sunnyvale original explicitly distinguishes
  // required attendance booking from an optional film reminder. Its footer
  // confirms free admission; the linked online talks ask viewers to register.
  // Evidence: docs/qa/2026-11-02-0107z-fact-check.md.
  {
    date: "2026-11-02", url: "https://sunnyvale.libcal.com/event/17134942",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED, audienceAge: "kids",
      attendanceNote: "For grades K–12. Registration is required. Arrive early: registrants' spots are guaranteed only until the start of the program.",
    },
  },
  {
    date: "2026-11-23", url: "https://sunnyvale.libcal.com/event/17754557",
    facts: {
      cost: "free", registration: REGISTRATION_NONE, audienceAge: "adult",
      attendanceNote: "For adults 18 and older. Registration is not required; optional signup provides an email reminder.",
    },
  },
  ...[["2026-11-19", "220791"], ["2026-11-12", "220092"]].map(([date, id]) => ({
    date, url: `https://libraryc.org/sunnyvalelibrary/${id}`,
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Register through the library's linked author-talk page to attend online.",
    },
  })),
  // The workshop's current body and shared signup instructions conflict.
  // Its unsourced 80%-of-the-US-population claim cannot support a statistic.
  // Keep the verified schedule and qualify access rather than pick a gate.
  {
    date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/6a99d8351c197d11325d14f5",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a99d8351c197d11325d14f5"],
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library's description says no registration is required, but its signup instructions request registration. Confirm attendance requirements with SJPL Works before going.",
    },
    copyReplacements: [[/When it comes to job searching, 80% of the US population gets their job through someone they know, this workshop/gi, "This workshop"]],
  },
  {
    date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/6a02181d43b41b3d0065b7ed",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a02181d43b41b3d0065b7ed"],
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library's schedule starts at 10 AM, while its description says 10:30–11:30 AM. Its booking form also conflicts with the no-registration wording. Confirm timing and signup details with Cambrian Library before going.",
    },
  },
  {
    date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/68df10f9023ff328007ce8d1",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/68df10f9023ff328007ce8d1"],
    facts: { attendanceNote: "Preregistration is encouraged; drop-ins may also be considered. Register online or call Willow Glen Library at 408-808-3045." },
  },
  {
    date: "2026-11-05", url: "https://sjpl.bibliocommons.com/events/6ac80f33901b02002cc10f6c",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6ac80f33901b02002cc10f6c"],
    facts: { attendanceNote: "Registration is required by phone: call Biblioteca Latinoamericana at 408-294-1237." },
  },
  // The exact Tully occurrence is Thursday, November 5, 4–5 PM, while its
  // shared description still says every Tuesday. Omit the conflicting clause;
  // this one occurrence does not establish a replacement Thursday cadence.
  // Evidence: docs/qa/2026-11-01-2207z-fact-check.md (fresh exact-ID response).
  {
    date: "2026-11-05",
    url: "https://sjpl.bibliocommons.com/events/6a4bcf2d4407827f8aa9a6cb",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a4bcf2d4407827f8aa9a6cb"],
    copyReplacements: [[/\s+every Tuesday\b/gi, ""]],
  },
  // The November MVCPA newsletter lost all six ticket links in extraction.
  // Its linked first-party pages confirm paid admission and distinguish the
  // concerts from dance/comedy. Bind repairs to actual dated occurrences;
  // a blank link also needs the exact title and venue, never a guessed URL.
  // Evidence: docs/qa/2026-11-01-2107z-fact-check.md.
  ...[
    ["2026-11-05", /^In Your Wildest Dreams with Seraph Brass and the San Francisco Brass Band$/i, "797", "SFBBWD", {
      category: "music",
    }],
    ["2026-11-06", /^NCCO Presents Groove with Marcus Roberts Trio$/i, "788", "NCCOG", {
      category: "music", title: "NCCO Presents Groove with Marcus Roberts Trio",
    }],
    ["2026-11-06", /^Best of SF Stand-Up Comedy$/i, "796", "FMMBSF1126", {
      audienceAge: "adult", kidFriendly: false,
      attendanceNote: "Ages 18 and up; tickets are required.",
    }],
    ["2026-11-07", /^Nutcracker in China$/i, "790", "NCDNC", {}],
    ["2026-11-08", /^Nutcracker in China \(matinee\)$/i, "790", "NCDNC", {}],
    ["2026-11-14", /^Music in-Takht$/i, "795", "DACMIT", {
      category: "music",
    }],
  ].map(([date, title, id, shortCode, facts]) => ({
    date, url: `https://tickets.mvcpa.com/eventperformances.asp?evt=${id}`,
    aliasUrls: [`https://tickets.mvcpa.com/${shortCode}`, `http://tickets.mvcpa.com/${shortCode}`],
    matches: (event) => !event.url && title.test(event.title || "")
      && /^(?:Mountain View Center for the Performing Arts|MVCPA(?: MainStage| SecondStage)?)(?:,|$)/i.test(event.venue || ""),
    facts: { url: `https://tickets.mvcpa.com/eventperformances.asp?evt=${id}`, cost: "paid", ...facts },
    copyReplacements: id === "797" ? [[/\bAnthony Di Lorenzo\b/g, "Anthony DiLorenzo"]] : [],
  })),
  // The city explicitly separates no advance registration from the emergency
  // card required on the child's first day. Do not describe the card as RSVP.
  // https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/430030f
  // Evidence: docs/qa/2026-11-01-1807z-fact-check.md.
  {
    date: "2026-11-23",
    matches: (event) => event.url === "https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/430030f"
      && event.title === "Thanksgiving Break: Fun on the Run"
      && ![REGISTRATION_FULL, REGISTRATION_CLOSED, REGISTRATION_APPOINTMENT].includes(event.registration),
    facts: {
      cost: "free", registration: REGISTRATION_NONE,
      attendanceNote: "No advance registration is required. A parent or guardian must complete an emergency card on the child's first day. Space is first-come, first-served; the program is canceled if no participants arrive during the first hour.",
    },
  },
  // The November Senior Center bulletin says Free (Registration Required).
  // Keep this condition even when the newsletter excerpt or cached blurb is
  // sparse; later editions need their own evidence.
  // https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/42e022e
  {
    date: "2026-11-18",
    matches: (event) => event.title === "Cookies, Tracking and Your Digital Footprint"
      && /^https:\/\/anc\.apm\.activecommunities\.com\/sunnyvaleactivities\/activity\/search\/detail\/2937(?:[?#]|$)/.test(event.url || ""),
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free for ages 50 and up; registration is required. Register online, at the Sunnyvale Senior Center, or by calling 408-730-7360.",
    },
  },
  // The occurrence's body says tickets are distributed when the branch
  // opens (10 AM Wednesday); registrationInfo says 30 minutes before its
  // 11 AM start. Keep both instructions qualified, never choose a clock.
  // Stop applying the warning if a fresh source resolves either statement.
  // Evidence: docs/qa/2026-10-31-2007-fact-check.md (exact gateway record).
  {
    date: "2026-11-04",
    matches: (event) => event.url === "https://sjpl.bibliocommons.com/events/695477f8cba30d92b60b3b7c"
      && /\bwhen the library opens\b/i.test(event.description || "")
      && /\b30 minutes prior to the start of storytime\b/i.test(event.attendanceNote || ""),
    facts: { attendanceStatus: "needs-confirmation" },
    copyReplacements: [
      [/A limited number of tickets will be distributed at the Information Desk when the Library opens\./gi,
        "The library publishes conflicting ticket pickup instructions: its description says pickup starts when it opens, while its signup instructions say 30 minutes before storytime. Confirm pickup timing with Pearl Avenue Library."],
      [/ ?A limited number of tickets will be distributed at the Information Desk 30 minutes prior to the start of Storytime\./gi, ""],
    ],
  },
  // The authenticated newsletter invites reservations. The dated 11:30 AM
  // booking page confirms a paid reserved seating: $70 meal + $5 fees.
  // Do not infer availability from hidden "Sold Out!" template text, a
  // booking deadline, or the price of the separate 2:30 PM seating.
  // Evidence: docs/qa/2026-10-31-2007-fact-check.md.
  {
    date: "2026-11-22",
    matches: (event) => /^https:\/\/my\.montalvoarts\.org\/(?:overview\/3253|3253\/3254)(?:[/?#]|$)/.test(event.url || "")
      && (!event.time || event.time === "11:30 AM"),
    facts: {
      cost: "paid", registration: REGISTRATION_REQUIRED,
      costNote: "$75 per person ($70 meal + $5 fees).",
      attendanceNote: "Reserve your 11:30 AM seating through the organizer's booking page.",
    },
  },
  // The organizer's page and authenticated museum newsletter describe
  // storytime and looking at artworks, without a hands-on art activity.
  // Repair the known cached claim; preserve later explicit organizer updates.
  // Evidence: docs/qa/2026-10-31-1907-fact-check.md.
  {
    date: "2026-11-16",
    matches: museumMinisWithoutArtMaking,
    facts: {},
    copyReplacements: [[/,\s*then make art with\b/gi, " and explore artworks with"]],
  },
  // The city's event body excerpt omits the separate admission panel. That
  // panel requires preregistration and prices residents/nonresidents, with
  // an explicit exemption for children under two. Do not invent a deadline.
  // Evidence: docs/qa/2026-10-31-1807-fact-check.md (fresh organizer page).
  {
    date: "2026-12-05",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Breakfast-with-Santa/Breakfast-with-Santa-Event",
    facts: {
      cost: "paid", registration: REGISTRATION_REQUIRED,
      costNote: "$18 for residents; $22 for nonresidents. Children under 2 are free.",
      attendanceNote: "Preregistration is required for attendees ages 2 and older: $18 for residents, $22 for nonresidents. Children under 2 are free and do not need to register.",
    },
  },
  // The newsletter excerpt omitted the Chinese tour's advance-registration
  // requirement. Its dated Stanford occurrence explicitly requires an RSVP;
  // the separate Spanish tour remains a free walk-in program.
  // Evidence: docs/qa/2026-10-31-0807-fact-check.md.
  {
    date: "2026-11-15",
    url: "https://events.stanford.edu/event/copy-of-public-tour-cantor-highlights-in-chinese-4381",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free tour; advance registration is required. Use the November 15 RSVP link on the organizer's event page.",
    },
  },
  // These two SJSU games are on the road. The original occurrence pages name
  // Irvine and Davis; a San Jose publisher never establishes a local venue.
  // Protect archived/retired copies as well as the current ingestion path.
  // Evidence: docs/qa/2026-10-31-0807-fact-check.md.
  {
    date: "2026-11-07",
    matches: (event) => !event.virtual
      && event.url === "https://events.sjsu.edu/event/mens-basketball-san-jose-state-at-uc-irvine",
    facts: { venue: "Irvine, Calif.", address: "", city: null, photoRef: null, image: null },
  },
  {
    date: "2026-11-06",
    matches: (event) => !event.virtual
      && event.url === "https://events.sjsu.edu/event/mens-soccer-san-jose-state-at-uc-davis-5703",
    facts: { venue: "Davis, Calif.", address: "", city: null, photoRef: null, image: null },
  },
  // Fresh organizer pages and RSS records, not the publisher's campus or a
  // keyword in an excerpt, establish these dated facts. Keep cached copies
  // and retired event pages consistent with the same evidence.
  // Evidence: docs/qa/2026-10-31-0307-fact-check.md.
  {
    date: "2026-10-30",
    url: "https://www.eastwestbooks.org/events/2026/psychic-readings-janis-manacsa",
    facts: {
      ongoing: false, time: "6:30 PM", endTime: "9:00 PM", cost: "paid",
      costNote: "General entry $75.", audienceAge: "adult", kidFriendly: false,
      attendanceNote: "Ages 18+. Doors close at 7:00 PM; no entry is permitted afterward.",
    },
  },
  {
    date: "2026-11-07",
    matches: (event) => !event.virtual
      && /^https:\/\/events\.scu\.edu\/(?:alumni-association\/)?event\/517852-santa-clara-sips-nyc\/?$/.test(event.url || ""),
    facts: { venue: "Gottino Enoteca e Salumeria, New York, NY", city: null, photoRef: null, image: null },
  },
  {
    date: "2026-11-14",
    url: "https://www.numulosgatos.org/events/plain-sight",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free with registration through the organizer's event page. Attend at NUMU or online via Zoom.",
    },
  },
  {
    date: "2026-10-31",
    url: "https://www.thetech.org/explore/upcoming-events/tech-or-treat/",
    facts: {
      cost: "paid", costNote: "Adults $38; children, seniors and students $28.",
      attendanceNote: "Workshops and laser shows cost extra and require additional tickets.",
    },
  },
  {
    date: "2026-11-04",
    url: "https://events.sjsu.edu/event/faculty-design-thinking-workshop",
    copyReplacements: [[/\bCfeti\b/g, "CFETI"]],
  },
  // The original SJDA newsletter explicitly confirms free admission; its
  // social link need not be scraped or treated as a source of instructions.
  {
    date: "2026-10-31",
    matches: (event) => /^https:\/\/(?:www\.)?instagram\.com\/p\/DeZtKbOmta2\/(?:[?#]|$)/.test(event.url || ""),
    facts: { cost: "free" },
  },
  // The October 29 city notice supersedes an earlier no-registration excerpt:
  // this reception is free but requires RSVP at the linked organizer page.
  // Match all three retained newsletter titles before and after venue cleanup.
  // Preserve SecondStage before comma-based extraction shortens the facility;
  // the exact ticket URL also identifies the occurrence after normalization.
  // Evidence: docs/qa/2026-10-31-0207-fact-check.md (receiving-account original).
  {
    date: "2026-11-04",
    url: "https://tickets.mvcpa.com/eventperformances.asp?evt=802",
    matches: (event) => [
      "Artist Reception & Gallery Talk with Zoe Caron",
      "Artist Reception & Gallery Talk featuring Zoe Caron",
      "Zoe Caron Artist Reception & Gallery Talk",
    ].includes(event.title)
      && /^(?:MVCPA SecondStage|Mountain View Center for the Performing Arts,? SecondStage)(?:,|$)/i.test(event.venue || ""),
    facts: {
      url: "https://tickets.mvcpa.com/eventperformances.asp?evt=802",
      venue: "MVCPA SecondStage",
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free; advance RSVP is required. Doors open at 5:00 PM; the artist talk begins at 6:00 PM.",
    },
  },
  ...SJZ_BREAK_ROOM_2026_OCCURRENCES.map(([date, slug, cost]) => ({
    date, url: `https://sanjosejazz.org/events/${slug}/`,
    facts: { venue: "SJZ Break Room", category: "music", cost },
    copyReplacements: [
      [/\bSan Jose Jazz Venue['’]s Break Room\b/g, "SJZ Break Room"],
      [/\b(?:San Jose )?Jazz Venue\b/g, "SJZ Break Room"],
      ...(slug === "legally-blue-2" ? [[/\bblues and soul standards\b/g, "blues"]] : []),
    ],
  })),
  // Exact original city newsletters supply the attendance conditions that
  // the extracted descriptions omitted. Keep later closed/full metadata.
  // Evidence: docs/qa/2026-10-30-2307-fact-check.md (receiving-account originals).
  // The November 2 bulletin prefixes these same sessions with "Senior
  // Workshop:". Match both reviewed titles, within their exact date/venue,
  // so a new newsletter copy cannot discard the audience or signup rules.
  // Evidence: docs/qa/2026-11-02-1807z-fact-check.md.
  ...[
    ["2026-11-05", ["Advance Care Planning Workshop", "Senior Workshop: Advance Care Planning"]],
    ["2026-11-12", ["Google Translate and Digital Emergency Prep Workshop", "Senior Workshop: Google Translate and Digital Emergency Prep"]],
    ["2026-11-19", ["Medicare Annual Enrollment and Updates 2027 Workshop", "Senior Workshop: Medicare's Annual Enrollment and Updates 2027"]],
  ].map(([date, titles]) => ({
    date,
    matches: (event) => titles.includes(event.title)
      && /^(?:Social Hall|Mountain View Senior Center)(?:,|$)/i.test(event.venue || ""),
    facts: {
      venue: "Mountain View Senior Center", registration: REGISTRATION_REQUIRED,
      audienceAge: "adult",
      attendanceNote: "Ages 55+. Sign up in advance at senior.center@mountainview.gov, by calling 650-903-6330, or at the Senior Center front desk. Held in the Social Hall.",
    },
  })),
  {
    date: "2026-11-10",
    matches: (event) => event.title === "Puzzle Swap"
      && /^(?:Lobby|Mountain View Senior Center)(?:,|$)/i.test(event.venue || ""),
    facts: {
      venue: "Mountain View Senior Center", cost: "free",
      url: "https://content.govdelivery.com/attachments/CAMOUNTAINVIEW/2026/10/20/file_attachments/3824125/November%20PS%202026.pdf",
    },
  },
  {
    date: "2026-11-21",
    title: /^Holiday Bazaar$/i, venue: /^Mountain View Senior Center(?:,|$)/i,
    facts: { cost: "free" },
  },
  {
    date: "2026-11-13",
    url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114852/",
    facts: {
      category: "education", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Advance registration is required through SCORE Silicon Valley.",
    },
  },
  {
    date: "2026-11-21",
    title: /^Let's Work! Quarry Park Clean-Up$/i, venue: /^Quarry Park(?:,|$)/i,
    facts: {
      registration: REGISTRATION_REQUIRED, audienceAge: "all",
      url: "https://saratoga.volunteerlocal.com/volunteer/?id=53322",
      attendanceNote: "Volunteers must be at least 15 to participate independently; ages 10–14 need an accompanying adult volunteer. Registration closes three days before the workday or when full.",
    },
  },
  // The original October 30 newsletter verifies this market occurrence and
  // Gaby Castro's set. Its unlabelled Halloween artwork could not be read
  // through an allowed source channel; withhold the unverified extra claims.
  {
    date: "2026-10-31",
    title: /^Halloween Trick-or-Treat at the Downtown Palo Alto Farmers' Market$/i,
    venue: /^Gilman Street between Hamilton and Forest(?:,|$)/i,
    facts: {
      title: "Downtown Palo Alto Farmers' Market", category: "food",
      url: "https://www.pafarmersmarket.org/",
      description: "The Downtown Palo Alto Farmers' Market runs Saturday, October 31, from 8 AM to noon on Gilman Street between Hamilton and Forest. Gaby Castro's music set starts at 9:30 AM.",
      blurb: "Browse the Downtown Palo Alto Farmers' Market and hear music by Gaby Castro.",
    },
  },
  // The library's documentary copy gives an unsupported national death
  // fraction. HURI's demographic research reports 13.3%, not one-quarter;
  // omit the disputed precision without changing the event or its synopsis.
  // https://www.gis.huri.harvard.edu/demographic-research
  // Evidence: docs/qa/2026-10-30-1907-fact-check.md.
  {
    date: "2026-11-14",
    matches: (event) => /^https:\/\/paloalto\.bibliocommons\.com\/(?:v2\/)?events\/6ae4c93a901b02002cc63238(?:[/?#]|$)/.test(event.url || ""),
    copyReplacements: [[/\bthe one-quarter of Ukraine['’]s population who\b/gi, "those who"]],
  },
  // The ticket page confirms a soul/blues/R&B concert. Sparse Montalvo
  // calendar rows omit that context and otherwise fall back to arts.
  // Evidence: docs/qa/2026-10-30-1907-fact-check.md (fresh ticket page).
  {
    date: "2026-11-13",
    matches: (event) => /^https:\/\/my\.montalvoarts\.org\/3232\/3246(?:[/?#]|$)/.test(event.url || "")
      || /^https:\/\/montalvoarts\.org\/experience\/carriage-house-concerts\/marc-broussard(?:[/?#]|$)/.test(event.url || ""),
    facts: { category: "music" },
  },
  // Prefer the organizer's dated registration page to its sparse calendar
  // card: Otto Lee's room is SVLG's, and Larry Klein's sales have ended.
  // Scope by occurrence and Eventbrite ID; tracking queries are not identity.
  // Evidence: docs/qa/2026-10-30-1307-fact-check.md (fresh ticket pages).
  {
    date: "2026-11-18",
    matches: (event) => /^https:\/\/www\.eventbrite\.com\/e\/coffee-conversation-otto-lee-tickets-2002235621643(?:[/?#]|$)/.test(event.url || ""),
    facts: { venue: "SVLG Conference Room" },
  },
  {
    date: "2026-12-10",
    matches: (event) => /^https:\/\/www\.eventbrite\.com\/e\/coffee-conversation-larry-klein-tickets-1998017392807(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      registration: REGISTRATION_CLOSED,
      attendanceNote: "Eventbrite ticket sales were closed when checked October 30. Confirm availability with SVLG before going.",
    },
  },
  // This road match is in Phoenix, with no street address in Localist.
  // Clear the inherited campus city/photo even on its retained old URL;
  // the normal geography gate excludes it from local event recommendations.
  // Evidence: docs/qa/2026-10-30-0907-fact-check.md (page and source metadata).
  {
    date: "2026-11-05",
    url: "https://events.sjsu.edu/event/womens-volleyball-san-jose-state-vs-grand-canyon",
    facts: { venue: "Phoenix, Ariz.", address: "", city: null, photoRef: null, image: null },
  },
  // The venue bills this dated booking under Concerts & Shows and lists
  // Shoreline Mafia in its subtitle. The title-only scraper loses that context.
  // Evidence: docs/qa/2026-10-30-0907-fact-check.md (fresh venue pages).
  {
    date: "2026-11-20",
    url: "https://www.sapcenter.com/events/detail/who-want-the-smoke-2026",
    facts: {
      category: "music",
      description: "Concert featuring Shoreline Mafia and other performers at SAP Center.",
      blurb: "Hear Shoreline Mafia and other performers in Who Want the Smoke 2026 at SAP Center.",
    },
  },
  // Stanford Live describes a multimedia performance with harp, violin and
  // original compositions. Its technology theme does not make it a class.
  // Corrections use the first match: keep the organizer's title here too,
  // so this category rule cannot shadow the older spelling correction below.
  // Evidence: docs/qa/2026-10-30-0907-fact-check.md and
  // docs/qa/2026-10-30-1207-fact-check.md (organizer occurrence).
  {
    date: "2027-02-04",
    url: "https://live.stanford.edu/events/26-27season/studio/renee-qin-and-ania-filochowska-the-world-we-speak-into-being/",
    facts: {
      category: "music",
      title: "Renée Qin and Ania Filochowska: The World We Speak Into Being",
    },
  },
  // The farm's October 30 occurrence promises music, without specifying a
  // live performance. Remove that cached embellishment only while the source
  // retains this wording; a later explicit live-music announcement survives.
  // Evidence: docs/qa/2026-10-30-0107-fact-check.md (first-party occurrence).
  {
    date: "2026-10-30",
    matches: (event) => event.url === "https://events.stanford.edu/event/farm-autumn-festival-the-odonohue-family-stanford-educational-farm"
      && /\bThere will be music,\s+activ(?:i)?ties and light bites\./i.test(event.description || "")
      && !/\blive\b/i.test(event.description || ""),
    copyReplacements: [[/\blive music\b/gi, "music"]],
  },
  // The browser index omits the venue and supporting combo. The organizer's
  // exact occurrence page confirms the outdoor venue and free admission.
  // Evidence: docs/qa/2026-10-30-0007-fact-check.md (fresh first-party page).
  {
    date: "2026-12-21",
    url: "https://sanjosejazz.org/events/hsas-big-band-at-christmas-in-the-park-2/",
    facts: {
      title: "HSAS Big Band / U19s at Christmas in the Park",
      category: "music",
      venue: "Plaza de César Chávez", address: "310 South First St, San Jose",
      cost: "free",
      description: "The San Jose Jazz High School All Stars Big Band and SJZ U19s perform holiday music at Christmas in the Park.",
      blurb: "Hear the HSAS Big Band and SJZ U19s play holiday music at Plaza de César Chávez; admission is free.",
    },
  },
  // This exact BiblioCommons record says 3–3:30 PM in its date fields but AM
  // in both language versions of its body. Preserve the source conflict and
  // stop qualifying it once the body or structured clocks change.
  // Evidence: docs/qa/2026-10-30-0007-fact-check.md (fresh exact-ID response).
  {
    date: "2026-11-01",
    matches: (event) => /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/6a7b58523f18f80030ba659d\/?$/.test(event.url || "")
      && event.time === "3:00 PM" && event.endTime === "3:30 PM"
      && /\bStorytime:?\s+3:00\s*[-–—]\s*3:30\s+am\b/i.test(event.description || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library calendar lists 3–3:30 PM, but its description uses a conflicting AM label. Confirm the storytime and Stay & Play timing with Edenvale Library.",
    },
  },
  // The Localist ticket label says Free-$390, but free in-person admission
  // requires Stanford affiliation. Preserve the actual attendance conditions.
  // Evidence: docs/qa/2026-10-29-2307-fact-check.md (fresh first-party page).
  {
    date: "2026-10-30",
    url: "https://events.stanford.edu/event/electrophysiology-in-the-west-2026",
    facts: {
      cost: "paid",
      costNote: STANFORD_EP_ADMISSION,
      attendanceNote: `Registration is required. ${STANFORD_EP_ADMISSION}`,
      registration: REGISTRATION_REQUIRED,
    },
  },
  // Restore primary participation links lost by newsletter extraction.
  // The exact City registration page also limits AfterHours to local teens
  // with a free membership; it showed full with a waiting list on October 27.
  // Evidence: docs/seo-2026-10-27-source-links.md (live organizer pages).
  {
    id: "inbound-c805739341b0e8c8", date: "2026-10-30",
    facts: {
      url: "https://anc.apm.activecommunities.com/mountainviewrecreation/activity/search/detail/19451?onlineSiteId=0&from_original_cui=true",
      cost: "free", kidFriendly: true, audienceAge: "kids",
      registration: REGISTRATION_FULL,
      attendanceNote: "For Mountain View and Los Altos students in grades 6–12 with a free Teen Center membership. As of October 27, the session was full with waiting-list registration open. Check the organizer's registration page for current availability.",
    },
  },
  {
    id: "inbound-dade0890a796356b", date: "2026-11-05",
    facts: {
      url: "https://losgatosca.gov/2026/Emergency-Preparedness#evacuation-listening-session",
      registration: REGISTRATION_NONE,
      attendanceNote: "No registration is required. The Town's event information includes a link to attend remotely via Zoom.",
    },
  },
  // The October 29 museum newsletter substituted opening hours for missing
  // event clocks. These two first-party occurrence pages publish real times;
  // the other four dates are confirmed only by the original received email.
  // Evidence: docs/qa/2026-10-29-1807-fact-check.md.
  {
    date: "2026-11-01",
    title: /^Día de los Muertos Celebration$/i,
    venue: /^Children's Discovery Museum of San Jose(?:,|$)/i,
    url: "https://www.cdm.org/event/dia-de-los-muertos/",
    facts: {
      time: "10:00 AM", endTime: "3:30 PM",
      url: "https://www.cdm.org/event/dia-de-los-muertos/",
    },
    copyReplacements: [[/\s*The newsletter gives no event time, so the start is the museum's weekend opening time\./g, ""]],
  },
  {
    date: "2026-12-06",
    title: /^Menorahs & Miracles(?: Hanukkah Celebration)?$/i,
    venue: /^Children's Discovery Museum of San Jose(?:,|$)/i,
    url: "https://www.cdm.org/event/menorahs-miracles/",
    facts: {
      time: "10:00 AM", endTime: "2:00 PM",
      url: "https://www.cdm.org/event/menorahs-miracles/",
    },
    copyReplacements: [[/\s*The newsletter gives no event time, so the start is the museum's weekend opening time\./g, ""]],
  },
  ...[
    ["2026-11-08", /^Orbital Escape Robotics Demonstration$/i],
    ["2026-11-11", /^Deck the Tree ornament-making$/i],
    ["2026-11-15", /^Drone Programming with Python$/i],
    ["2026-11-21", /^Daisy Day: Design with Nature$/i],
  ].map(([date, title]) => ({
    date, title,
    venue: /^(?:Children's Discovery Museum of San Jose(?:,|$)|Art Studio(?:, Children's Discovery Museum of San Jose|$))/i,
    facts: {
      time: null, endTime: null,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The museum's October 29 newsletter confirms this date but gives no activity time. Confirm the activity schedule with Children's Discovery Museum before going.",
    },
    copyReplacements: [[/\s*The newsletter gives no event time, so the start is the museum's weekend opening time\./g, ""]],
  })),
  // The sparse theater snapshot loses the promoter's children ages 2–7
  // audience and supplies a generic community blurb. Match this booking,
  // not every event sharing the theaters landing page, before cache lookup.
  // https://www.nederlanderconcerts.com/event/be-like-blippi-tour-2
  // Evidence: docs/qa/2026-10-29-0207-fact-check.md.
  {
    date: "2026-10-28",
    matches: (event) => /^Be Like Blippi(?: Tour!?)?$/i.test(event.title || "")
      && event.venue === "San Jose Civic"
      && ["https://www.sanjose.org/theaters", "https://www.nederlanderconcerts.com/event/be-like-blippi-tour-2"].includes(event.url),
    facts: {
      category: "family", kidFriendly: true, audienceAge: "kids",
      url: "https://www.nederlanderconcerts.com/event/be-like-blippi-tour-2",
      description: "Live stage show featuring Blippi and Meekah, designed especially for children ages 2–7.",
      blurb: "See Blippi and Meekah in a live show designed for children ages 2–7.",
    },
  },
  // The public page explicitly labels admission Free Event and asks for the
  // matching form by October 26 at noon. That elapsed form deadline does not
  // prove the gathering itself is closed; confirm attendance before going.
  // Evidence: docs/qa/2026-10-29-0207-fact-check.md (fresh organizer page).
  {
    date: "2026-10-29",
    url: "https://events.stanford.edu/event/bff-matchmaking",
    facts: {
      category: "community",
      cost: "free",
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer asked participants to complete the personality matching form by October 26 at noon. Confirm attendance with the organizer if you missed that deadline.",
    },
  },
  // This is SCU's organized trip, not an 8:30 AM event at a Santa Clara hotel.
  // SCU's indexed full listing gives the transport schedule and October 5
  // signup deadline; fresh occurrence JSON-LD confirms its date and destination.
  // Keep the local-departure trip, identify its out-of-area destination, and
  // require confirmation of late signup rather than infer current closure.
  // https://events.scu.edu/campus-calendar/event/517331-startup-world-cup-grand-finale
  // https://www.startupworldcup.io/grand-finale
  // Evidence and browser access limit: docs/qa/2026-10-29-0207-fact-check.md.
  {
    date: "2026-11-06",
    url: "https://events.scu.edu/ciocca-center/event/517331-startup-world-cup-grand-finale",
    // SCU's November 2 RSS switched to /live/events/; it is the same dated trip.
    // The fresh expanded LiveWhale API confirms the original travel/deadline
    // facts. Evidence: docs/qa/2026-11-02-2207z-fact-check.md.
    aliasUrls: [
      "https://events.scu.edu/event/517331-startup-world-cup-grand-finale",
      "https://events.scu.edu/campus-calendar/event/517331-startup-world-cup-grand-finale",
      "https://events.scu.edu/live/events/517331-startup-world-cup-grand-finale",
    ],
    facts: {
      title: "Startup World Cup Grand Finale (SCU day trip)",
      address: "333 O'Farrell Street, San Francisco, CA 94102",
      registration: REGISTRATION_REQUIRED,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "SCU's calendar requested registration by October 5. Transportation leaves SCU at 8:30 AM for Hilton Union Square in San Francisco, with a planned 7:30 PM return. Confirm late signup availability and the departure point with SCU before going.",
      description: "SCU-organized day trip to the Startup World Cup Grand Finale in San Francisco. Provided transportation departs SCU at 8:30 AM, with a planned return at 7:30 PM.",
      blurb: "Take SCU's organized day trip to the Startup World Cup in San Francisco; confirm late signup availability with the organizer.",
    },
  },
  // Stanford's occurrence page explicitly labels this Free Event and offers
  // registration. The exact Localist record leaves its opt-in free flag
  // false and ticket_cost blank; neither establishes paid admission.
  // https://events.stanford.edu/event/film-screening-american-solitaire
  // Evidence: docs/qa/2026-10-28-1807-fact-check.md (page and exact API).
  {
    date: "2026-10-28",
    url: "https://events.stanford.edu/event/film-screening-american-solitaire",
    facts: { cost: "free" },
  },
  // The event body waives tickets, while registrationInfo still describes
  // ticket distribution. Neither field establishes which instruction wins.
  // Keep this occurrence listed with a confirmation note, out of day plans,
  // and stop applying the warning when fresh source copy resolves the issue.
  // https://sjpl.bibliocommons.com/events/6ab41205129d8e0031f486b2
  // Evidence: docs/qa/2026-10-28-1507-fact-check.md and the captured fixture.
  {
    date: "2026-10-29",
    matches: (event) => event.url === "https://sjpl.bibliocommons.com/events/6ab41205129d8e0031f486b2"
      && /\bstorytime tickets are not required\b/i.test(event.description || "")
      && /\btickets will be distributed\b[^.!?]*\b30 minutes\b/i.test(event.attendanceNote || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library's description says tickets are not required, but its signup instructions describe ticket pickup 30 minutes before storytime. Confirm ticket requirements with Cambrian Library before going.",
    },
    copyReplacements: [[/Storytime tickets are not required for this storytime\./gi,
      "Confirm storytime ticket requirements with Cambrian Library; the event description and signup instructions disagree."]],
  },
  // Both exact organizer records describe musicians working on the named
  // song. Meetup's adapter supplies a generic community category instead.
  // Keep the verified music genre through cached blurb resolution.
  // Evidence: docs/qa/2026-10-28-1007-fact-check.md (authenticated exact IDs).
  {
    date: "2026-11-21",
    url: "https://www.meetup.com/bay-area-musicians-meetup/events/317153723/",
    facts: { category: "music" },
  },
  {
    date: "2026-11-28",
    url: "https://www.meetup.com/bay-area-musicians-meetup/events/317153732/",
    facts: { category: "music" },
  },
  // The venue's sparse replacement omits the concert genre. Ticketmaster's
  // exact occurrence G5vYZbU3R_nwH identifies Music / Rock and agrees on the
  // date, start and venue. Preserve that category after source deduplication.
  // Evidence: docs/qa/2026-10-28-0607-fact-check.md.
  {
    date: "2026-11-18",
    url: "https://www.sapcenter.com/events/detail/three-days-grace",
    facts: { category: "music" },
  },
  // The October 27 downtown newsletter incorrectly ends this run on Nov. 18.
  // Broadway San Jose's own schedule confirms Oct. 30–Nov. 1 and a 6 PM
  // opening performance. Every attendee needs a ticket, including children.
  // Evidence: docs/qa/2026-10-28-0407-fact-check.md.
  {
    date: "2026-10-30",
    url: "https://broadwaysanjose.com/shows/blueys-big-play/",
    aliasUrls: ["https://www.ticketmaster.com/blueys-big-play-tickets/artist/2726558?venueId=229426&list_view=1"],
    facts: {
      url: "https://broadwaysanjose.com/shows/blueys-big-play/",
      cost: "paid",
      description: "Live puppet theater adaptation of Bluey, running October 30 through November 1 at San Jose Center for the Performing Arts. Every attendee needs a ticket, including children.",
    },
  },
  // The library's heading and Disney's film page agree on The Nightmare
  // Before Christmas; the source body and cached blurb use the wrong article.
  // https://movies.disney.com/the-nightmare-before-christmas
  // Evidence: docs/qa/2026-10-28-0007-fact-check.md (exact library record).
  {
    date: "2026-10-30",
    url: "https://sjpl.bibliocommons.com/events/6ab41251da318a10e63638c7",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6ab41251da318a10e63638c7"],
    copyReplacements: [[/\bA Nightmare Before Christmas\b/g, "The Nightmare Before Christmas"]],
  },
  // The city's original October 27 teen newsletter asks people to register
  // early but does not state a mandatory booking gate. Preserve that request
  // instead of the extractor's stronger "registration is required" claim.
  // Evidence: docs/qa/2026-10-27-2307-fact-check.md (original received email).
  {
    date: "2026-11-07",
    url: "https://anc.apm.activecommunities.com/mountainviewrecreation/activity/search/detail/19449?onlineSiteId=0&from_original_cui=true",
    facts: {
      description: "Bus trip to UC Santa Cruz for Mountain View and Los Altos students in 11th and 12th grade to explore campus and learn about college life. Light breakfast is served on the bus and lunch is provided on campus. Space is limited; the city asks participants to register early.",
      blurb: "Tour UC Santa Cruz with The View Teen Center for Mountain View and Los Altos students in grades 11–12; breakfast and lunch are provided.",
      attendanceNote: "Space is limited. The city asks participants to register early using its activity page.",
    },
  },
  // The public page explicitly labels this Free Event, although Localist's
  // opt-in free flag is unset. Its audience includes General Public, and its
  // registration link is an invitation, not an established mandatory gate.
  // Evidence: docs/qa/2026-10-27-1907-fact-check.md (indexed page and exact API).
  {
    date: "2026-10-28",
    url: "https://events.stanford.edu/event/GSB-Alumni-Innovating-for-American-Safety-Net",
    facts: {
      cost: "free",
      attendanceNote: "Free and open to the public. Registration is offered through the form linked on Stanford's event page.",
    },
    copyReplacements: [[/\bsession for Stanford GSB alumni\b/g, "panel featuring Stanford GSB alumni"]],
  },
  // The exact Meetup occurrence is a 4–6 PM group gathering. Festival hours
  // and admission come from its operator, whose age-8 ticket requirement
  // supersedes the Meetup body's unsupported free-spectator claim.
  // https://www.waterlanternfestival.com/events/san-jose
  // Evidence: docs/qa/2026-10-27-1907-fact-check.md.
  {
    date: "2026-11-14",
    url: "https://www.meetup.com/townflame/events/315756596/",
    facts: {
      cost: "paid",
      costNote: "Festival tickets are required for ages 8 and older; children under 8 enter free.",
      attendanceNote: "The group meetup is 4–6 PM; the festival runs 2:30–6:30 PM. Festival admission is separate from a Meetup RSVP, and tickets are required for ages 8 and older.",
    },
    copyReplacements: [[/\bfor the Water Lantern Festival\b/g, "at the ticketed Water Lantern Festival"]],
  },
  // JOIN_OPEN is not permission to attend without being listed as going.
  // Keep source full/closed states; the shared guard below preserves them.
  // Evidence: docs/qa/2026-10-27-1907-fact-check.md (authenticated exact ID).
  {
    date: "2026-11-01",
    url: "https://www.meetup.com/south-bay-over-50-social-pickleballers/events/317153210/",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "The organizer requires attendees to be listed as going. Play starts at 8 AM; arriving at 7:30 AM is encouraged to help claim courts. Waitlisted players must check in with the host and follow the organizer's no-show substitution rules.",
    },
  },
  // The source newsletter writes 11:30 PM. The extractor silently substituted
  // 11:30 AM, which no retained primary source confirms. Clear the invented
  // finish while retaining the city's explicit 10:30 AM storytime start.
  // Evidence: docs/qa/2026-10-27-1907-fact-check.md (original received email).
  {
    date: "2026-10-29",
    url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114667/",
    facts: {
      endTime: null,
      attendanceNote: "The city newsletter confirms a 10:30 AM start but lists an 11:30 PM finish. Confirm the end time with Central Park Library.",
    },
  },
  // Keep the full first-party attendance instructions when the feed excerpt
  // ends before them. An RSVP invitation alone does not establish a gate.
  // Evidence: docs/qa/2026-10-27-1107-fact-check.md (page and exact Localist API).
  {
    date: "2026-10-27",
    url: "https://events.stanford.edu/event/the-offline-dream-program-three-takes-on-film-the-internet-and-instanternity",
    facts: {
      attendanceNote: "The organizer requests an RSVP using the form linked on Stanford's event page.",
    },
  },
  {
    date: "2026-10-27",
    url: "https://events.stanford.edu/event/public-lecture-gravitational-wave-detection",
    facts: {
      attendanceNote: "The organizer offers registration through its event page. The livestream link is included in the registration confirmation email.",
    },
  },
  // These are visitor-entry instructions for the published exhibition runs,
  // not advance reservations or a campus-only audience restriction.
  // Evidence: docs/qa/2026-10-27-1107-fact-check.md (exact Localist records).
  {
    dateFrom: "2026-09-21", dateThrough: "2026-12-18",
    url: "https://events.stanford.edu/event/electric-contrasts-the-art-of-the-detail-7315",
    facts: {
      attendanceNote: "Visitors are asked to call 650-723-3408 for building and elevator access to Bowes Art & Architecture Library.",
    },
  },
  {
    dateFrom: "2026-09-22", dateThrough: "2027-01-24",
    url: "https://events.stanford.edu/event/a-vision-of-paris-the-roxane-debuisson-collection-at-stanford",
    facts: {
      attendanceNote: "Bring a valid government ID and register at the entrance to Green Library to view the exhibition.",
    },
  },
  // Explicit free admission in the full body outranks an unset price flag.
  // Evidence: docs/qa/2026-10-27-1107-fact-check.md.
  {
    dateFrom: "2026-10-07", dateThrough: "2026-12-04",
    url: "https://events.stanford.edu/event/touch-me-not-12th-annual-undergraduate-juried-exhibition",
    facts: { cost: "free" },
  },
  {
    date: "2026-11-03",
    url: "https://events.sjsu.edu/event/natalie-and-james-thompson-gallery-common-ground",
    facts: { cost: "free" },
  },
  // The bookstore's title and the publisher agree on Ligon. Its calendar
  // body drops the g, and its product page independently mistypes Ligor.
  // Repair source and cached prose before publication, scoped to this date.
  // https://www.simonandschuster.com/books/No-Legs-No-Limits-%28An-Empowering-Picture-Book-for-Kids%29/Kanya-Sesser/9781499818086
  // Evidence: docs/qa/2026-10-27-1107-fact-check.md.
  {
    date: "2026-11-22", url: "https://www.lindentreebooks.com/events-calendar/",
    copyReplacements: [[/\bNisha Lamsam (?:Lion|Ligor)\b/g, "Nisha Lamsam Ligon"]],
  },
  // The full occurrence and its banner request an October 23 RSVP. Preserve
  // the elapsed deadline without inferring that admission or signup is closed.
  // Evidence: docs/qa/2026-10-27-0407-fact-check.md (fresh page and exact API).
  {
    date: "2026-10-27",
    url: "https://events.stanford.edu/event/organizing-in-solidarity-at-stanford-past-present",
    facts: {
      attendanceNote: "The organizer requested RSVPs by October 23. Check with the organizer about attending after that deadline.",
    },
  },
  // JOIN_OPEN describes Meetup availability, not the organizer's attendance
  // instructions. Retain this invitation without inventing a required gate.
  // Evidence: docs/qa/2026-10-27-0407-fact-check.md (authenticated exact-ID API).
  {
    date: "2026-10-29",
    url: "https://www.meetup.com/autonomous-application-development-meetup-group/events/317097934/",
    facts: {
      attendanceNote: "The organizer asks attendees to sign up in advance; spaces are limited.",
    },
  },
  // The full occurrence explicitly says free, public and advance registration
  // required, despite Localist's unset free flag and shortened display copy.
  // Evidence: docs/qa/2026-10-27-0307-fact-check.md (fresh page and exact API).
  {
    date: "2026-10-27",
    url: "https://events.stanford.edu/event/the-illicit-finance-hydra-crypto-sanctions-evasion-and-the-new-financial-battlefield",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free and open to the public. Advance registration is required using the RSVP form linked on Stanford's event page.",
    },
  },
  // These occurrences ask readers to RSVP. An invitation alone does not
  // establish mandatory registration; preserve it without inventing a gate.
  // Evidence: docs/qa/2026-10-27-0307-fact-check.md (fresh pages and exact APIs).
  ...["an-evening-of-poetry-with-fady-joudah", "the-unbroken-sky"].map((slug) => ({
    date: "2026-10-27", url: `https://events.stanford.edu/event/${slug}`,
    facts: {
      attendanceNote: "The organizer requests an RSVP using the form linked on Stanford's event page.",
    },
  })),
  // The organizer's occurrence page corrects its newsletter's caterer typo
  // and explicitly prices members, guests and walk-ins separately.
  // https://business.campbellchamber.net/events/details/monthly-luncheon-16558
  // Evidence: docs/qa/2026-10-26-2207-fact-check.md.
  {
    date: "2026-11-18",
    url: "https://business.campbellchamber.net/events/details/monthly-luncheon-16558",
    facts: {
      cost: "paid", costNote: "$35 for Chamber members; $40 for guests and all walk-ins.",
      attendanceNote: "$35 for Chamber members; $40 for guests and all walk-ins.",
    },
    copyReplacements: [[/\bTable & Terrance\b/g, "Table & Terrace"]],
  },
  // Free workshop, with a requested RSVP and a bring-your-own-lunch notice.
  // https://business.campbellchamber.net/events/details/lunch-learn-communicating-for-results-16553
  // Evidence: docs/qa/2026-10-26-2207-fact-check.md.
  {
    date: "2026-10-30",
    url: "https://business.campbellchamber.net/events/details/lunch-learn-communicating-for-results-16553",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "The organizer requests an RSVP. Bring your own lunch and a guest.",
    },
  },
  // The original Chamber newsletter supplies a ticket link, date and clocks.
  // It does not establish the price; preserve unknown admission rather than
  // borrowing a fee from another brunch or claiming checkout was accessible.
  // Evidence: docs/qa/2026-10-26-2207-fact-check.md.
  {
    date: "2026-11-14", url: "https://buy.stripe.com/cNi6oH5XSbIJ4ECarc3oA08",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Reserve tickets through the organizer before attending.",
    },
  },
  // These three official ticket pages give 655 Campus Drive, not the 641
  // copied into newsletter intake. Keep their 7 PM clocks and ticket gates.
  // Evidence: docs/qa/2026-10-26-2207-fact-check.md.
  ...[
    ["2026-11-02", "eastern-washington-0jbp1f"],
    ["2026-11-06", "oakland-6av258"],
    ["2026-11-09", "rice-vtjdko"],
  ].map(([date, opponent]) => ({
    date, url: `https://tickets.gostanford.com/events/mens-basketball-vs-${opponent}`,
    facts: {
      address: "655 Campus Drive, Stanford, CA 94305",
      cost: "paid", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Tickets are required; purchase through Stanford's official ticket page.",
    },
  })),
  // Restore the source's research-association initials in this article title.
  // Its Localist record leaves price unset despite the page's zero-price
  // schema offer. Keep admission unknown while that evidence conflicts.
  // Evidence: docs/qa/2026-10-26-2207-fact-check.md.
  {
    date: "2026-10-27",
    url: "https://events.stanford.edu/event/maisha-winn-futuring-black-lives-independent-black-institutions-and-the-literary-imagination",
    copyReplacements: [[/\bAera Presidential Address\b/g, "AERA Presidential Address"]],
  },
  // The organizer moved this book club from November 29 to December 6 at
  // 4 PM; both its calendar summary and scoped heading agree. Correct the
  // stale snapshot before occurrence filtering, including its dated proof.
  // Preserve the ages 9+ / email RSVP terms without inventing admission.
  // https://www.lindentreebooks.com/events-calendar/
  // Evidence: docs/qa/2026-10-26-1807-fact-check.md and
  // docs/qa/2026-10-28-2307-fact-check.md.
  ...["2026-11-29", "2026-12-06"].map((date) => ({
    date,
    matches: (event) => event.url === "https://www.lindentreebooks.com/events-calendar/"
      && /^Middle Grade Book Club: The Wish Ring Cipher$/i.test(event.title || "")
      && /^Linden Tree Books$/i.test(event.venue || ""),
    facts: {
      ...(date === "2026-11-29" ? {
        date: "2026-12-06", displayDate: "Sun, Dec 6",
        occurrenceEvidence: {
          kind: "first-party-occurrence-page",
          sourceUrl: "https://www.lindentreebooks.com/events-calendar/",
          date: "2026-12-06",
        },
      } : {}),
      cost: null,
      registration: REGISTRATION_REQUIRED,
      kidFriendly: true,
      audienceAge: "kids",
      attendanceNote: "For readers ages 9 and older. Email the bookstore to RSVP using its events calendar.",
    },
  })),
  // These newly received Triton occurrences explicitly request Eventbrite
  // RSVPs. The original museum newsletter and its calendar establish the
  // individual lecture fee and distinguish it from the free artist talks.
  // https://www.tritonmuseum.org/events
  // Evidence: docs/qa/2026-10-26-1807-fact-check.md.
  {
    date: "2026-10-29",
    title: /^Impressionism: The Beautiful Revolution [–—-] Lecture 4$/i,
    venue: /^Triton Museum of Art$/i,
    facts: {
      cost: "paid", costNote: "$25 for an individual lecture.",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Purchase tickets through the organizer's Eventbrite page.",
    },
  },
  ...[
    ["2026-11-07", /^Harry Clewans Artist Talk$/i],
    ["2026-11-08", /^The Monuments Men: Reception and Art History Presentation$/i],
  ].map(([date, title]) => ({
    date, title, venue: /^Triton Museum of Art$/i,
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free admission. RSVP through the organizer's Eventbrite page.",
    },
  })),
  // An RSVP link alone does not establish mandatory advance registration.
  // Leave any later source-supplied booking state intact.
  // Evidence: docs/qa/2026-11-07-1207z-fact-check.md.
  {
    date: "2026-12-05",
    matches: (event) => event.venue === "Triton Museum of Art"
      && /^https:\/\/www\.eventbrite\.com\/e\/rose-sellery-artist-talk-tickets-2002592274401(?:[/?#]|$)/.test(event.url || ""),
    facts: {
      cost: "free",
      attendanceNote: "Free admission. RSVP through the organizer's Eventbrite page.",
    },
  },
  // The exhibition pages describe selected studio work and an exploration
  // of inheritance, not newly created work by both artists or inherited
  // physical objects. Keep cached blurbs within those verified claims.
  // Evidence: docs/qa/2026-10-26-1007-fact-check.md.
  {
    dateFrom: "2026-10-16", dateThrough: "2026-11-14",
    url: "https://www.icasanjose.org/current-exhibitions/wearecaliforniaartists/",
    facts: { blurb: "See sculptures by Wanxin Zhang alongside work by Diane Ding at ICA San José." },
  },
  {
    dateFrom: "2026-09-18", dateThrough: "2027-02-21",
    url: "https://www.icasanjose.org/current-exhibitions/gregito-togiveandtake/",
    facts: { blurb: "Explore Greg Ito's paintings, sculptures and video installation about family, sacrifice and inheritance at ICA San José." },
  },
  // First-party ticket pages distinguish the free community showcase from
  // the paid student performance. Sparse calendar/booking responses must not
  // restore a fee or turn the performing ensemble into a craft activity.
  // Evidence: docs/qa/2026-10-26-1007-fact-check.md.
  {
    date: "2026-11-01", url: "https://my.montalvoarts.org/3248/3250",
    aliasUrls: ["https://my.montalvoarts.org/3248/3250?promo="],
    facts: {
      cost: "free", kidFriendly: true,
      // The dated ticket page offers $0 adult/child RSVP tiers. Retain that
      // option without claiming registration is mandatory or sold out from
      // the checkout template's hidden "Sold Out!" heading.
      // Evidence: docs/qa/2026-10-26-2307-fact-check.md.
      attendanceNote: "The organizer offers free adult and child RSVPs through its ticket page. No parking at Montalvo. Use free parking and shuttle service from West Valley College.",
    },
    // Newsletter photos do not confirm this year's face-painting program;
    // the current occurrence page does confirm artists and vendors.
    // Evidence: docs/qa/2026-11-02-0107z-fact-check.md.
    copyReplacements: [
      [/with artists, vendors and face painting shown in the newsletter photos/gi, "with artists and vendors"],
      [/with artists, vendors, and face painting/gi, "with artists and vendors"],
    ],
  },
  {
    date: "2026-11-04", url: "https://my.montalvoarts.org/overview/3066",
    facts: {
      cost: "paid", kidFriendly: true,
      description: "Mosaic America presents music, dance and storytelling celebrating Diwali and other festivals in Montalvo's performing arts series for students in grades K–8.",
      blurb: "See Mosaic America perform music, dance and storytelling in Montalvo's student series for grades K–8.",
    },
  },
  // JOIN_OPEN does not override an occurrence's explicit RSVP instructions.
  // Preserve the source's deadline and any current full/closed state below.
  // Evidence: docs/qa/2026-10-26-1007-fact-check.md (authenticated records).
  {
    date: "2026-11-13", url: "https://www.meetup.com/bhajanclubbingjamming/events/316961984/",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Confirm attendance on the organizer's Meetup event before joining.",
    },
  },
  {
    date: "2026-12-03", url: "https://www.meetup.com/baypiggies/events/317138013/",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "RSVP on Meetup by Wednesday, December 2, the night before the event.",
    },
  },
  {
    date: "2026-10-31", url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/316656187/",
    facts: {
      cost: "paid", costNote: "Organizer contribution requested; confirm the amount before joining.",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "RSVP and organizer approval are required; do not walk in. The organizer requests a $5–$20 contribution at check-in and reserves the right to ask non-contributors to leave.",
    },
  },
  // The October 23 Sunnyvale Library newsletter explicitly requires booking
  // for these three occurrences. Its separate reminder signup for the
  // November 1 dance program does not establish an attendance requirement.
  // Evidence: docs/qa/2026-10-26-0707-fact-check.md.
  ...[["2026-10-26", "17153875"], ["2026-10-27", "17731808"], ["2026-10-28", "17178520"]].map(([date, sourceId]) => ({
    date, url: `https://sunnyvale.libcal.com/event/${sourceId}`,
    facts: { registration: REGISTRATION_REQUIRED, attendanceNote: "Registration is required through Sunnyvale Public Library." },
  })),
  // Dated authenticated Meetup records, not inferred group-wide terms.
  // Evidence: docs/qa/2026-10-26-0707-fact-check.md.
  {
    date: "2026-11-03",
    matches: (event) => event.url === "https://www.meetup.com/san-jose-diet-meetup-group/events/316989193/"
      && event.attendanceStatus === "needs-confirmation"
      && /6–7:15 PM.*7–8:30 PM/.test(event.attendanceNote || ""),
    facts: { blurb: "Join Mantra Room for kirtan, meditation and a plant-based dinner; confirm the conflicting session times with the organizer before going." },
  },
  {
    date: "2026-10-29", url: "https://www.meetup.com/downtowners20-40s/events/317104221/",
    facts: { cost: "low", costNote: "$5 cover for dancing.", attendanceNote: "The organizer lists a $5 cover for dancing." },
  },
  {
    date: "2026-10-27", url: "https://www.meetup.com/southbayimprovfun/events/317056442/",
    facts: {
      costNote: "Free to watch. Participation costs $12 in advance or $15 at the door; nobody is turned away for lack of funds.",
      attendanceNote: "Watching is free. To participate, use the organizer's ticket link: $12 before the event day or $15 at the door. Nobody is turned away for lack of funds. The restaurant kitchen will be closed.",
    },
  },
  {
    date: "2026-11-07", url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/316788593/",
    facts: {
      cost: "paid", costNote: "Organizer contribution requested; confirm the amount before joining.",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "RSVP and organizer approval are required; do not walk in. The organizer requests a $5–$20 contribution at check-in and reserves the right to ask non-contributors to leave.",
    },
  },
  {
    date: "2026-10-28", url: "https://www.meetup.com/south-bay-50-social-hikers/events/317096095/",
    // DAR is the restaurant in the organizer's post-hike lunch plans.
    // The full body forbids joining without being on the going list. JOIN_OPEN
    // does not grant walk-in admission. Preserve a current full/closed state.
    // Evidence: docs/qa/2026-10-27-1107-fact-check.md (authenticated exact ID).
    facts: {
      title: "St. Joseph's Hill (from Vasona) with DAR",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "RSVP on Meetup and be listed as going before joining the hike; the organizer does not allow walk-ins.",
    },
  },
  // The organizer explicitly calls the cinema and 3 PM start tentative and
  // requires RSVPs plus payment for a group ticket purchase. JOIN_OPEN does
  // not establish a confirmed screening or permission to walk in.
  // https://www.meetup.com/interrobang/events/316773298/
  // Evidence: docs/qa/2026-10-26-0307-fact-check.md (authenticated API record).
  {
    date: "2026-11-08",
    url: "https://www.meetup.com/interrobang/events/316773298/",
    facts: {
      cost: "paid", costNote: "Movie ticket purchase required; price not published.",
      registration: REGISTRATION_REQUIRED,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer says the time and cinema are tentative and may change. RSVP ahead, pay for your movie ticket, and confirm the final screening with the organizer.",
      blurb: "Interrobang is planning a Klara and the Sun movie outing; the screening time and cinema are tentative.",
    },
  },
  // JOIN_OPEN describes Meetup membership, but this occurrence's organizer
  // explicitly requires $45 per person before a spot is confirmed. Its body
  // gives only the Santa Teresa/Snell area, so do not invent a street address.
  // Verified through the existing authenticated Meetup integration.
  // https://www.meetup.com/silicon-valley-women-social-circle-45/events/316877918/
  // Evidence: docs/qa/2026-10-25-2207-fact-check.md.
  {
    date: "2026-10-25",
    url: "https://www.meetup.com/silicon-valley-women-social-circle-45/events/316877918/",
    facts: {
      cost: "paid", costNote: "$45 per person",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Advance payment of $45 per person is required to confirm your spot. Contact the organizer for the exact location.",
    },
  },
  // The city's dated winter slots say noon–4 PM, while the same page's
  // program still says every Saturday 11 AM–3 PM. Keep the published slots
  // and disclose the conflict only while both claims remain. These are the
  // dates on the current page, not a projected recurrence or a clock repair.
  // https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Environmental-Education-Center-Open-House
  // Evidence: docs/qa/2026-10-25-1007-fact-check.md.
  ...["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19"].map((date) => ({
    date,
    matches: (event) => event.url === "https://www.cupertino.gov/Parks-Recreation/Events/McClellan-Events/Environmental-Education-Center-Open-House"
      && event.time === "12:00 PM" && event.endTime === "4:00 PM"
      && /\bevery Saturday from 11 a\.m\. to 3 p\.m\./i.test(event.description || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The city's dated calendar lists noon–4 PM, but its description says every Saturday 11 AM–3 PM. Confirm the open-house hours with Cupertino Parks and Recreation before going.",
    },
  })),
  // The restaurant identifies itself as La Fondue at the same Saratoga
  // address as the listing's venue. Repair only this title typo, preserving
  // its full attendance state and all organizer-supplied occurrence fields.
  // https://www.lafondue.com/about-us/
  // Evidence: docs/qa/2026-10-25-1007-fact-check.md.
  {
    date: "2026-11-13",
    matches: (event) => event.url === "https://www.meetup.com/i-wanna-do-it-but-not-alone/events/316965375/"
      && event.title === "Fine Dining & Conversation in La Foundue, Saratoga"
      && event.venue === "La Fondue",
    facts: { title: "Fine Dining & Conversation in La Fondue, Saratoga" },
  },
  // Both dated city pages require child registration, but their post-Oct 19
  // prices disagree. Preserve the conflict rather than choosing a new price.
  // https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash/Monster-Mash-Event
  // https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash
  // Evidence: docs/qa/2026-10-25-0207-fact-check.md.
  {
    date: "2026-10-24",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash/Monster-Mash-Event",
    aliasUrls: ["https://www.cupertino.gov/Parks-Recreation/Events/Monster-Mash"],
    facts: {
      // Numeric costNote values become JSON-LD offer floors. Keep the
      // conflicting figures in the visible attendance note instead.
      costNote: "Paid registration; Cupertino's event pages list different current rates. Confirm pricing with the city.",
      registration: REGISTRATION_REQUIRED,
      attendanceStatus: "needs-confirmation",
      attendanceNote: "After October 19, Cupertino's city calendar lists $22 residents / $26 nonresidents; its main event page lists $23 / $28. Confirm current pricing with the city. Children must register and attend with an adult; adults do not need to register separately.",
    },
  },
  // Cupertino's dated occurrence puts both residency rates and mandatory
  // registration for every child/adult in a Pricing sidebar. Older browser
  // snapshots only read Cost and omit those terms. Keep this edition correct
  // through refresh without imposing its prices on another year's event.
  // https://www.cupertino.gov/Parks-Recreation/Events/Signing-Santa/Signing-Santa-Event
  // Evidence: docs/qa/2026-10-24-2307-fact-check.md.
  {
    date: "2026-12-12",
    url: "https://www.cupertino.gov/Parks-Recreation/Events/Signing-Santa/Signing-Santa-Event",
    facts: {
      cost: "low", costNote: "$5 residents; $6 nonresidents.",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "$5 residents; $6 nonresidents. Preregistration is required for every attending child and adult.",
    },
  },
  // The organizer's poster confirms the title, History Park, October 24 and
  // 2–6:30 PM, but supplies no program description. Its linked ticket page is
  // excluded by robots.txt. Keep copy within those verified facts rather
  // than restoring cached trick-or-treat, character, or interactive-scare claims.
  // https://historysanjose.org/event/childrens-halloween-haunt/
  // Evidence: docs/qa/2026-10-24-2207-fact-check.md.
  {
    date: "2026-10-24",
    url: "https://historysanjose.org/event/childrens-halloween-haunt/",
    aliasUrls: ["https://fareharbor.com/embeds/book/historysanjose/items/314582/?full-items=yes&flow=583745"],
    facts: { blurb: "Visit History Park for Children's Halloween Haunt." },
  },
  // NUMU's dated page explicitly says "Free with registration". Newsletter
  // intake omits both admission and signup; do not carry that omission into
  // the published occurrence or extend these terms to another edition.
  // https://www.numulosgatos.org/events/reawakening
  // Evidence: docs/qa/2026-10-24-2207-fact-check.md.
  {
    date: "2026-11-07",
    url: "https://www.numulosgatos.org/events/reawakening",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free with registration through NUMU's event page.",
    },
  },
  // The dated library record gives 3–4 PM but describes a 1.5-hour festival.
  // Preserve the header and disclose the conflict only while both remain;
  // revised clocks or a corrected duration must not acquire this warning.
  // https://sjpl.bibliocommons.com/events/69c19013e2a2952aed0a154b
  // Evidence: docs/qa/2026-10-24-1807-fact-check.md (exact gateway record).
  {
    date: "2026-10-25",
    matches: (event) => event.url === "https://sjpl.bibliocommons.com/events/69c19013e2a2952aed0a154b"
      && event.time === "3:00 PM" && event.endTime === "4:00 PM"
      && /\bthe festival will be open for 1\.5 hours\b/i.test(event.description || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library lists 3–4 PM, but its description says the festival lasts 1.5 hours. Confirm the end time with Alviso Library before going.",
    },
  },
  // The dated Stanford pages publish Free Event. Only the panel explicitly
  // asks attendees to register; the lecture's Register link alone does not
  // establish a requirement. Preserve that distinction.
  // Evidence: docs/qa/2026-10-24-1707-fact-check.md (retained first-party pages).
  {
    date: "2026-10-26",
    url: "https://events.stanford.edu/event/being-muslim-on-campus",
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free admission; register through Stanford's event page before attending.",
    },
  },
  {
    date: "2026-10-26",
    url: "https://events.stanford.edu/event/the-golden-age-or-the-dark-time-of-the-plots",
    facts: { cost: "free" },
  },
  // The first workshop makes skulls; decorating requires returning November 1.
  // Keep the phases separate even when a cached blurb summarizes the series.
  // Only apply while the source still publishes this two-session schedule.
  // https://sjpl.bibliocommons.com/events/6ad39fc229c3d60033309963
  // Evidence: docs/qa/2026-10-24-1407-fact-check.md.
  {
    date: "2026-10-25",
    matches: (event) => event.url === "https://sjpl.bibliocommons.com/events/6ad39fc229c3d60033309963"
      && /Participants will not be able to finish their skulls in one session/i.test(event.description || "")
      && /Session 1:\s*Sunday,\s*October 25\b/i.test(event.description || "")
      && /Session 2:\s*Sunday,\s*November 1\b/i.test(event.description || ""),
    facts: {
      blurb: "Begin making a sugar skull for Día de los Muertos; return November 1 to decorate it.",
    },
  },
  // SJSU labels this Musical Performance, explicitly says free and open to
  // all, and publishes 3–5 PM PST. RSS loses the end and admission details.
  // https://events.sjsu.edu/event/mariachi-band-performance-dia-de-los-angelitos
  // Evidence: docs/qa/2026-10-24-1407-fact-check.md.
  {
    date: "2026-11-01",
    url: "https://events.sjsu.edu/event/mariachi-band-performance-dia-de-los-angelitos",
    facts: {
      category: "music", endTime: "5:00 PM", cost: "free",
      // The complete occurrence requests an RSVP after the retained RSS
      // paragraph. "RSVP here" establishes an invitation, not a mandatory
      // registration gate. Evidence: docs/qa/2026-10-26-2307-fact-check.md.
      attendanceNote: "Free and open to all. The organizer requests an RSVP using the form linked on its event page.",
    },
  },
  // SJSU's occurrence page identifies Musical Performance and publishes
  // 6:30–7:30 PM. Its RSS importer loses the end and chooses general arts.
  // https://events.sjsu.edu/event/candlelight-a-haunted-evening-of-halloween-classics
  // Evidence: docs/qa/2026-10-24-1107-fact-check.md.
  {
    date: "2026-10-30",
    url: "https://events.sjsu.edu/event/candlelight-a-haunted-evening-of-halloween-classics",
    facts: { category: "music", endTime: "7:30 PM" },
  },
  // The Halloween occurrence's body starts cooking at 5 PM and distribution
  // at 6:30–8 PM, conflicting with its header. The header end changed from
  // 7 PM to 6:30 PM; avoid freezing a second copy of those mutable clocks in
  // the warning. Preserve the current source fields and disclose the conflict.
  // https://www.meetup.com/san-jose-diet-meetup-group/events/316878539/
  // Evidence: docs/qa/2026-10-28-0807-fact-check.md (authenticated API record).
  {
    date: "2026-10-31",
    url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316878539/",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's description says cooking begins at 5 PM and meal distribution runs 6:30–8 PM, which conflicts with the event header. Confirm the volunteer schedule with Mantra Room before going.",
      blurb: "Help prepare and share vegan meals at Mantra Room; confirm the volunteer schedule with the organizer before going.",
    },
  },
  // Intake already warns about the two parks. Regenerated or cached copy
  // must not turn the disputed venue field into an unqualified location.
  // Guard on the intake warning so revised, consistent source terms survive.
  // https://www.meetup.com/connected-through-music/events/317105031/
  // Evidence: docs/qa/2026-10-24-1107-fact-check.md (authenticated API record).
  {
    date: "2026-11-14",
    matches: (event) => event.url === "https://www.meetup.com/connected-through-music/events/317105031/"
      && event.attendanceStatus === "needs-confirmation"
      && /John D\. Morgan Park/i.test(event.attendanceNote || "")
      && /Baylands Park/i.test(event.attendanceNote || ""),
    facts: {
      blurb: "Join the community drum circle; confirm the meeting location with the organizer before going.",
    },
  },
  // The organizer's body names Voyager, whose own location page confirms
  // 2221 The Alameda. The Meetup venue field retains the café's old name.
  // https://voyagercraftcoffee.com/locations
  // Evidence: docs/qa/2026-10-24-1007-fact-check.md.
  {
    date: "2026-10-31",
    matches: (event) => event.url === "https://www.meetup.com/santa-clara-running-group/events/316904074/"
      && /^(?:Mission City Coffee Roasting Co|Voyager Craft Coffee)$/i.test(event.venue || "")
      && /^2221 The Alameda, Santa Clara(?:, CA(?: 95050)?)?$/i.test(event.address || ""),
    facts: {
      venue: "Voyager Craft Coffee",
      blurb: "Run or walk with the Santa Clara-San Jose Running Group, meeting at Voyager Craft Coffee on The Alameda.",
    },
  },
  // The independently published chamber occurrence confirms free admission
  // and Big Basin Way. Newsletter extraction omitted its link and price.
  // https://members.saratogachamber.org/events/details/witchy-walk-a-bout-10852
  // Evidence: docs/qa/2026-10-24-0507-fact-check.md.
  {
    date: "2026-10-31",
    matches: (event) => event.city === "saratoga"
      && /^Witchy Walk-A-Bout$/i.test(event.title || "")
      && /^(?:Historic Saratoga Village|Saratoga Historic Village)$/i.test(event.venue || ""),
    facts: {
      url: "https://members.saratogachamber.org/events/details/witchy-walk-a-bout-10852",
      address: "Big Basin Way, Saratoga, CA", cost: "free",
    },
  },
  // Newsletters and the city calendar name the same occurrence differently.
  // Canonicalize every known source before dedup, including the sparse city
  // survivor; "maker fair" alone does not establish handmade-goods shopping.
  // The organizer's dated Event JSON-LD confirms the STEM program and clocks.
  // https://saratogasmash.web.app/
  // Evidence: docs/qa/2026-10-24-0007-fact-check.md and 2026-10-24-0407-fact-check.md.
  {
    date: "2026-11-01",
    matches: (event) => (
      /^https?:\/\/saratogasmash\.web\.app\/?(?:\?.*)?$/i.test(event.url || "")
      && /^(?:smash maker fair(?: 2026)?|5th annual smash post-halloween stem festival)$/i.test(event.title || "")
    ) || (
      /^https:\/\/(?:www\.)?saratoga\.ca\.us\/calendar\.aspx\?EID=2690$/i.test(event.url || "")
      && /^smash maker fair(?: 2026)?$/i.test(event.title || "")
    ),
    facts: {
      title: "SMASH Maker Fair", url: "https://saratogasmash.web.app/",
      time: "2:00 PM", endTime: "5:00 PM",
      venue: "Saratoga High School courtyard",
      address: "20300 Herriman Avenue, Saratoga, CA 95070",
      category: "community", cost: "free", kidFriendly: true, audienceAge: "all",
      registration: REGISTRATION_NONE,
      description: "Free community STEM festival hosted by MSET Cuttlefish, with pumpkin smashing and composting, robot demonstrations, maker exhibits, science activities and school club booths. All ages welcome; no registration required.",
      blurb: "Watch pumpkins get smashed and composted, and explore robot demonstrations, science activities and maker booths at Saratoga High School.",
    },
  },
  // The same party URL moved from December 6 to December 13. Keep this dated
  // correction separate from the old occurrence, and preserve its approved
  // Palo Alto coverage bucket while displaying the real Menlo Park locality.
  // https://www.keplers.org/upcoming-events-internal/holiday-party-2026
  // https://my.montalvoarts.org/3107/3150
  // Evidence: docs/qa/2026-10-24-0407-fact-check.md.
  {
    date: "2026-12-13", url: "https://www.keplers.org/upcoming-events-internal/holiday-party-2026",
    facts: {
      venue: "Kepler's Books", locality: "Menlo Park", cost: null,
      description: "Celebrate Kepler's annual holiday party at the bookstore with festive drinks, sweets and gift wrapping. Active members receive an additional 10% off purchases that day; shipping and memberships are excluded.",
      blurb: "Visit Kepler's Books for its annual holiday party, with festive drinks, sweets and gift wrapping.",
    },
  },
  {
    date: "2026-11-06", url: "https://my.montalvoarts.org/3107/3150",
    facts: {
      category: "music",
      blurb: "Hear Irish traditional and Celtic folk music from Solas at Montalvo Arts Center.",
    },
  },
  // The occurrence's description says 60 minutes, but its registrationInfo
  // instructions say 30. Neither source field establishes the right pickup
  // time. Stop applying this warning if a fresh source resolves the conflict.
  // https://sjpl.bibliocommons.com/events/691fb8c1dff9d93e00d10dc4
  // The November 10 occurrence repeats the same conflict in its exact record.
  // Evidence: docs/qa/2026-10-24-0407-fact-check.md and
  // docs/qa/2026-11-07-1807z-fact-check.md (exact gateway responses).
  ...[
    ["2026-10-27", "691fb8c1dff9d93e00d10dc4"],
    ["2026-11-10", "691fb8c1dff9d93e00d10dc6"],
  ].map(([date, id]) => ({
    date,
    matches: (event) => event.url === `https://sjpl.bibliocommons.com/events/${id}`
      && /\b60 minutes\b/i.test(event.description || "")
      && /\b30 minutes\b/i.test(event.attendanceNote || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library's description says ticket pickup starts 60 minutes before storytime, while its signup instructions say 30 minutes. Confirm pickup timing with Willow Glen Library.",
    },
    copyReplacements: [[/A limited number of tickets will be distributed at the Information Desk 60 minutes prior to the start of Storytime\./gi,
      "The library publishes conflicting ticket pickup instructions (60 or 30 minutes before storytime); confirm pickup timing with Willow Glen Library."]],
  })),
  // "Reading to Children" is not evidence that children read to the volunteer.
  // Keep the source's small-group format without inventing a participant role.
  // https://sjpl.bibliocommons.com/events/6a5e86410e562e28009b31f5
  // Evidence: docs/qa/2026-10-24-0407-fact-check.md.
  {
    date: "2026-10-28", url: "https://sjpl.bibliocommons.com/events/6a5e86410e562e28009b31f5",
    facts: {
      blurb: "Join a volunteer for a small-group reading session in Berryessa Library's Children's Area.",
    },
  },
  // The film's subject is journalist Amy Goodman; Tia Lessin co-directed it.
  // Stanford's two Jasper Ridge pages require registration and give a campus
  // shuttle meeting point, with no children under 14. Same audit evidence below.
  {
    date: "2026-10-23",
    url: "https://events.stanford.edu/event/steal-this-story-please-documentary-screening-wamy-goodman-tia-lessin-3663",
    facts: {
      blurb: "Watch Steal This Story, Please! and join a Q&A with journalist Amy Goodman and filmmaker Tia Lessin.",
    },
  },
  ...[
    "https://events.stanford.edu/event/copy-of-cbd-2026-afternoon-jasper-ridge-biological-preserve-ootchamin-ooyakma-contemplative-hikes-in-nature",
    "https://events.stanford.edu/event/copy-of-cbd-2026-jasper-ridge-biological-preserve-ootchamin-ooyakma-contemplative-hikes-in-nature",
  ].map((url) => ({
    date: "2026-10-24", url,
    facts: {
      venue: "Searsville Parking Lot", cost: "free", registration: REGISTRATION_REQUIRED,
      kidFriendly: false,
      attendanceNote: "Register for your hike's time slot. Meet at the Searsville Parking Lot near the Central Energy Facility at 140 Searsville Road for the shuttle to Jasper Ridge. Ages 14 and older; pets, including service/support animals, are not allowed on the trails.",
      blurb: "Meet at Stanford's Searsville Parking Lot for a shuttle to a contemplative hike at Jasper Ridge. Registration required; ages 14+.",
    },
  })),
  // The ticket pages confirm Cagan Stadium, paid admission, and Pacific
  // starts. Notre Dame's 21:00Z is 1 PM after the Nov 1 DST change, not 9 PM.
  // Evidence: docs/qa/2026-10-23-1307-fact-check.md.
  ...[
    ["2026-11-01", "womens-soccer-vs-notre-dame-aqbvne", "1:00 PM", "Notre Dame"],
    ["2026-10-29", "womens-soccer-vs-nc-state-fgrxdx", "7:00 PM", "NC State"],
  ].map(([date, slug, time, opponent]) => ({
    date, url: `https://tickets.gostanford.com/events/${slug}`,
    facts: {
      time, venue: "Cagan Stadium", address: "641 Nelson Road, Stanford, CA 94305",
      cost: "paid", photoRef: null,
      blurb: `Watch Stanford women's soccer host ${opponent} at Cagan Stadium.`,
    },
  })),
  // The authenticated organizer record names LinkedIn HQ, not the organizing
  // group's name, as the destination. Samza occurs only in the group credit.
  // Its structured date says Tuesday while its body says Thursday; preserve
  // that conflict instead of guessing another date. Apply only to the sparse
  // listing and these clocks so a revised source body or schedule can prevail.
  // https://www.meetup.com/stream-processing-meetup-linkedin/events/317066673/
  // Evidence: docs/qa/2026-10-23-0007-fact-check.md.
  {
    date: "2026-12-08",
    matches: (event) => event.url === "https://www.meetup.com/stream-processing-meetup-linkedin/events/317066673/"
      && event.time === "5:00 PM" && event.endTime === "8:00 PM"
      && ["Meetup event by Stream Processing with Apache Kafka, Samza, and Flink.", LINKEDIN_STREAM_DESCRIPTION]
        .includes(event.description),
    facts: {
      venue: "LinkedIn HQ",
      description: LINKEDIN_STREAM_DESCRIPTION,
      blurb: "Learn about Apache Kafka, Apache Flink, and Change Data Capture at a meetup hosted by LinkedIn.",
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The listing's date fields say Tuesday, December 8, but its description says Thursday. Confirm the date with the organizer.",
    },
  },
  // The October 25 organizer page still contradicts itself. Preserve its
  // overall window and disclose the conflict rather than copying October 18's
  // inferred meridiem repair onto a different occurrence. A newer corrected
  // source body or changed header clocks must keep its own reviewed content.
  // Evidence: docs/qa/2026-10-22-hillview-halloween-timing.md.
  {
    date: "2026-10-25",
    matches: (event) => /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/6aa860334ea230006f3407bf\/?$/.test(event.url || "")
      && event.time === "12:30 PM" && event.endTime === "1:30 PM"
      && /\bStorytime:?\s+12:30\s*[-–—]\s*1:00\s+am\b/i.test(event.description || ""),
    facts: { attendanceStatus: "needs-confirmation", attendanceNote: HILLVIEW_HALLOWEEN_TIMING },
    copyReplacements: [[/\bStorytime:?\s+12:30\s*[-–—]\s*1:00\s+am\b(?:[;.\s]+Stay\s*&\s*Play:?\s+1:00\s*[-–—]\s*1:30\s+pm\b)?\.?/gi, HILLVIEW_HALLOWEEN_TIMING]],
  },
  // Stanford's October 22 tour page explicitly says full capacity; a free
  // tour still requires a reservation. The psychology talk requires an RSVP
  // to receive its location. Evidence: docs/qa/2026-10-21-2107-fact-check.md.
  {
    date: "2026-10-22",
    url: "https://events.stanford.edu/event/copy-of-tour-denning-house-home-to-knight-hennessy-scholars-8021",
    facts: {
      cost: "free", registration: REGISTRATION_FULL,
      attendanceNote: "This tour is at full capacity. Registration is required; check the organizer for other tour dates.",
      blurb: "The October 22 Denning House tour is full; check Knight-Hennessy Scholars for upcoming tours.",
    },
  },
  {
    date: "2026-10-22",
    url: "https://events.stanford.edu/event/bani-adam-universal-human-psychology-and-our-omnicultural-future",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free and open to the public. RSVP to receive the location.",
    },
  },
  // "Adults, children, and infants" describes the CPR techniques, not the
  // audience. The dated organizer page limits participants to 13+, and its
  // ticket widget confirms Sold out / Join Waitlist on October 21.
  // Evidence: docs/qa/2026-10-21-1907-fact-check.md.
  {
    id: "inbound-9542c24070ff7e38", date: "2026-10-22",
    url: "https://Oct2026handsonlycprmontesereno.eventbrite.com",
    aliasUrls: [
      "https://oct2026handsonlycprmontesereno.eventbrite.com",
      "https://www.eventbrite.com/e/hands-only-cpr-and-aed-class-15-monte-sereno-15-hrs-2026-tickets-1998436176400",
    ],
    facts: {
      address: "18041 Saratoga-Los Gatos Road, Monte Sereno, CA 95030",
      category: "education", kidFriendly: false,
      cost: "low", costNote: "From $17.85",
      registration: REGISTRATION_FULL,
      description: "A 90-minute informational workshop for participants age 13 and older, taught by Santa Clara County Fire Department staff. Learn hands-only CPR, AED use, and choking-relief techniques for adults, children, and infants. The class fee is $15 ($17.85 with Eventbrite fees), including a pocket mask and travel first aid kit. This class does not provide certification.",
      blurb: "For ages 13+: learn hands-only CPR, AED use, and choking relief with county fire staff at Monte Sereno City Hall.",
      attendanceNote: "Sold out; the organizer offers a waitlist. Participants under 18 need a signed parent or guardian waiver. Open to people who live or work in County Fire's service area.",
    },
  },
  // First-party October 21 refresh review. Keep these occurrence-specific
  // repairs ahead of sparse feeds, retained snapshots and cached blurbs.
  // Evidence: docs/qa/2026-10-21-1607-fact-check.md.
  ...[
    ["2026-10-31", "2:00 PM", "10:00 PM"],
    ["2026-11-01", "10:00 AM", "6:00 PM"],
  ].map(([date, time, endTime]) => ({
    date, url: "https://www.aztecadancers.com/dia-de-muertos",
    facts: { time, endTime, cost: "free", kidFriendly: true, address: "635 Phelan Ave, San Jose, CA 95112" },
  })),
  {
    date: "2026-10-25",
    url: "https://events.scu.edu/live/events/511268-encore-markey-center-on-the-road-with-fr-bill",
    aliasUrls: [
      "https://events.scu.edu/markey-center/event/511268-encore-markey-center-on-the-road-with-fr-bill",
      "https://events.scu.edu/event/511268-encore-markey-center-on-the-road-with-fr-bill",
    ],
    facts: {
      city: "santa-cruz", venue: "Villa Maria Del Mar",
      address: "21918 E Cliff Dr, Santa Cruz, CA 95062", endTime: "4:30 PM",
    },
  },
  {
    date: "2027-01-02", url: "https://paloalto.bibliocommons.com/events/6ab8557e607483003829d148",
    aliasUrls: ["https://paloalto.bibliocommons.com/v2/events/6ab8557e607483003829d148"],
    facts: {
      registration: REGISTRATION_NONE, registrationClosesBy: null,
      attendanceNote: "Registration is not required. Optional signup provides an email reminder.",
    },
  },
  {
    date: "2026-12-06", url: "https://www.keplers.org/upcoming-events-internal/holiday-party-2026",
    // The party page publishes no admission price. A generic Eventbrite
    // button cannot establish paid admission; keep the unknown price null.
    facts: { venue: "Kepler's Books", cost: null },
  },
  {
    date: "2026-12-31", url: "https://paloalto.bibliocommons.com/events/6a750a3788e9bf28003613ac",
    aliasUrls: ["https://paloalto.bibliocommons.com/v2/events/6a750a3788e9bf28003613ac"],
    facts: { category: "family" },
  },
  // Stanford's dated location note directs attendees to Huffington Barn at
  // 555 Fremont Road and explicitly rejects the farm's generic map address.
  // https://events.stanford.edu/event/rescheduled-to-1021-a-thyme-to-gather-at-the-farm-a-herbalism-workshop
  // Evidence: docs/qa/2026-10-21-1307-fact-check.md.
  {
    date: "2026-10-21",
    url: "https://events.stanford.edu/event/rescheduled-to-1021-a-thyme-to-gather-at-the-farm-a-herbalism-workshop",
    facts: {
      venue: "Huffington Barn at O'Donohue Educational Farm",
      address: "555 Fremont Rd, Stanford, CA 94305",
      attendanceNote: "Use Huffington Barn at 555 Fremont Road. The organizer says not to use the farm's 175 Electioneer Road address.",
    },
  },
  // These dated library bodies describe recommended signup or reminder-only
  // forms, not admission requirements. Protect older retained snapshots too.
  // Evidence: docs/qa/2026-10-21-1307-fact-check.md (first-party page bodies).
  ...[
    ["2026-10-24", "sjpl", "6ab19c4ba5dbde002aa64a61", "Registration is recommended."],
    ["2026-11-15", "paloalto", "697a5067834cbb3dea29ea08", "Registration is not required. Optional signup provides a reminder email the day before."],
    ["2026-12-19", "paloalto", "6ad7a697295d793e2d1803ec", "Registration is not required. Optional signup provides a reminder email the day before."],
  ].map(([date, library, sourceId, attendanceNote]) => ({
    date, url: `https://${library}.bibliocommons.com/events/${sourceId}`,
    aliasUrls: [`https://${library}.bibliocommons.com/v2/events/${sourceId}`],
    facts: { registration: REGISTRATION_NONE, registrationClosesBy: null, attendanceNote },
  })),
  // The Pear's current season page starts this run February 19. Its ticket
  // dates agree; the old introductory copy still says February 20.
  // https://www.thepear.org/season25
  // Evidence: docs/qa/2026-10-21-1307-fact-check.md.
  {
    dateFrom: "2027-02-19", dateThrough: "2027-03-07",
    url: "https://thepear.vbotickets.com/events?eid=193671",
    copyReplacements: [[/\bFeb 20\s*[-–—]\s*March 7\b/gi, "Feb 19 – March 7"]],
  },
  // The city's dated listing requires the signup form; the newsletter
  // intake omitted the registration field despite preserving the requirement
  // in its description. Sparse intake must not advertise this as a walk-up.
  // https://www.santaclaraca.gov/Home/Components/Calendar/Event/114375/41?curm=11&cury=2026&date=20191208031809
  // Evidence: docs/qa/2026-10-21-1207-fact-check.md.
  {
    date: "2026-11-04", url: "https://www.santaclaraca.gov/Home/Components/Calendar/Event/114375/",
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Registration is required; space is limited. Use the form on the library's event page.",
    },
  },
  // The city's occurrence pages and Pacific-TZID iCal feed agree on starts.
  // The old fixed PDT parser shifted winter events one hour early. The
  // carol-sing page publishes no end; omit the feed's 23:59 placeholder.
  // Evidence: docs/qa/2026-10-21-1207-fact-check.md.
  ...[
    ["2026-11-01", "2690", "2:00 PM", "5:00 PM"],
    ["2026-11-27", "2686", "3:00 PM", "5:00 PM"],
    ["2026-12-05", "2681", "6:30 PM", null],
    ["2026-11-27", "2687", "6:00 PM", "9:00 PM"],
    ["2026-11-27", "2698", "5:30 PM", "6:30 PM"],
    ["2026-11-14", "2696", "9:00 AM", "12:00 PM"],
    ["2026-12-12", "2697", "9:00 AM", "12:00 PM"],
  ].map(([date, sourceId, time, endTime]) => ({
    date, url: `https://www.saratoga.ca.us/calendar.aspx?EID=${sourceId}`,
    aliasUrls: [`https://www.saratoga.ca.us/Calendar.aspx?EID=${sourceId}`],
    facts: { time, endTime },
  })),
  // These occurrence pages explicitly make signup optional. Their form and
  // its deadline cannot turn walk-in admission into required/closed signup.
  // Keep the capacity and priority conditions visible, and keep the repair
  // dated rather than weakening BiblioCommons' conservative provider rule.
  // Evidence: docs/qa/2026-10-21-1207-fact-check.md (first-party page bodies).
  // November 5 Bascom chess reconfirmed in docs/qa/2026-11-03-0407z-fact-check.md.
  ...[
    ["2026-10-24", "6a3f10c0f56bd86e00b95e69", "Registration is requested but not required."],
    ["2026-10-24", "6a87354c46e4c80031cbd152", "Preregistration is recommended but not required. Limited to 20 participants; preregistered teens receive priority if capacity is reached."],
    ["2026-10-24", "68fc0358c313c23700ded894", "Registration is recommended. Walk-ins are welcome if space is available; the class is limited to 10 attendees."],
    ["2026-10-22", "6a83721e4cb69d003e216ef0", "Registration is encouraged but not required."],
    ["2026-11-05", "6a83721e4cb69d003e216ef2", "Registration is encouraged but not required."],
  ].map(([date, sourceId, attendanceNote]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
    aliasUrls: [`https://sjpl.bibliocommons.com/v2/events/${sourceId}`],
    facts: { registration: REGISTRATION_NONE, registrationClosesBy: null, attendanceNote },
  })),
  // The capped-title cleanup mistook the abbreviation "St." for a sentence
  // ending and discarded the hike's actual destination. Preserve the named
  // place from the organizer's dated occurrence in older sparse snapshots.
  // Keep the editorial spelling correction so this override cannot restore
  // the organizer's "Excises" typo after the copy pass.
  // https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/317070276/
  // Evidence: docs/qa/2026-10-21-1207-fact-check.md.
  {
    date: "2026-10-31", url: "https://www.meetup.com/bay-area-hiking-walking-wellness-club/events/317070276/",
    facts: { title: "Green Exercise Wellness Hike St. Joseph's Hill Preserve Rain or Shine" },
  },
  // The dated header says 3–7 PM, but the organizer's body starts cooking at
  // 5 PM and distributes meals from 6:30–8 PM. Preserve the header clocks
  // and show the conflict instead of choosing a replacement schedule.
  // https://www.meetup.com/san-jose-diet-meetup-group/events/316768949/
  // Evidence: docs/qa/2026-10-21-1007-fact-check.md.
  {
    date: "2026-10-24", url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316768949/",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's event header lists 3–7 PM, but the description says cooking begins at 5 PM and meal distribution runs 6:30–8 PM. Confirm the volunteer schedule with Mantra Room before going.",
    },
  },
  // The organizer separates paid competition entry from a free walk-in corner.
  // Preserve both terms instead of presenting the timed competition as drop-in.
  // https://www.meetup.com/social-speed-puzzling/events/315893663/
  // Evidence: docs/qa/2026-10-21-0807-fact-check.md.
  {
    date: "2026-11-07", url: "https://www.meetup.com/social-speed-puzzling/events/315893663/",
    facts: {
      cost: "paid", registration: REGISTRATION_REQUIRED,
      costNote: "$15 per competition entry; casual puzzling is free.",
      attendanceNote: "Competition entry is $15 per person and requires registration. Check-in opens at 1 PM; arrive by 1:15 PM for the 1:30 PM competition. The free casual puzzling corner welcomes walk-ins without registration.",
    },
  },
  // The foundation's own ticket page welcomes all ages and lists $50 tickets,
  // including breakfast activities and all-day park admission.
  // https://e.givesmart.com/events/P0d/i/_All/AS7u/?search=
  // Evidence: docs/qa/2026-10-21-0807-fact-check.md.
  {
    date: "2026-12-06", url: "https://e.givesmart.com/events/P0d/i/_All/AS7u/?search=",
    facts: {
      kidFriendly: true, cost: "paid",
      costNote: "$50 per ticket, including breakfast activities and all-day park admission.",
      attendanceNote: "All ages welcome. The $50 ticket includes breakfast, activities, and all-day park admission. Buy tickets through Happy Hollow Foundation.",
    },
  },
  // SJAA explicitly welcomes walk-ins; a Meetup group-approval requirement
  // applies to that site's RSVP, not admission to this public observing event.
  // https://www.sjaa.net/events/solar-observing/
  // The same dated Meetup occurrence moved from Nov. 1 to Nov. 8, retaining
  // 1:30–3:30 PM at Houge Park. These corrections never create an occurrence.
  // Evidence: docs/qa/2026-10-21-0507-fact-check.md and 2026-10-28-0407-fact-check.md.
  ...["2026-11-01", "2026-11-08"].map((date) => ({
    date, url: "https://www.meetup.com/sj-astronomy/events/312677419/",
    facts: {
      registration: REGISTRATION_NONE, registrationClosesBy: null, cost: "free",
      attendanceNote: "Open to the public. Walk-ins welcome; a Meetup RSVP is optional.",
    },
  })),
  // The museum's full Halloween event body advertises FREE family fun;
  // its Squarespace excerpt omits admission.
  // Keep sparse intake and retired-page snapshots from restoring paid badges.
  // Evidence: docs/qa/2026-10-21-0107-fact-check.md.
  {
    date: "2026-10-31", url: "https://www.moah.org/moahevents/halloween-night-at-the-museum-1",
    facts: { cost: "free" },
  },
  // The full SCU occurrence explicitly welcomes children and families; its
  // one-sentence feed preview omits the hands-on family activities.
  // https://events.scu.edu/arts-and-sciences/event/521019-child-studies-legislative-summit
  // Evidence: docs/qa/2026-10-20-1807-fact-check.md.
  // Event JSON-LD also confirms 21:00Z–00:00Z, or 2–5 PM Pacific.
  // End-time evidence: docs/qa/2026-10-24-1707-fact-check.md.
  {
    date: "2026-10-24",
    url: "https://events.scu.edu/arts-and-sciences/event/521019-child-studies-legislative-summit",
    facts: { category: "family", kidFriendly: true, endTime: "5:00 PM" },
  },
  // October 24 is a Saturday. The dated library occurrence is authoritative;
  // its copied first-Thursday boilerplate must not move the meeting.
  // https://sjpl.bibliocommons.com/v2/events/6a3d7bfbed35742f00fe48cf
  // Evidence: docs/qa/2026-10-20-1807-fact-check.md.
  {
    date: "2026-10-24",
    url: "https://sjpl.bibliocommons.com/events/6a3d7bfbed35742f00fe48cf",
    aliasUrls: ["https://sjpl.bibliocommons.com/v2/events/6a3d7bfbed35742f00fe48cf"],
    copyReplacements: [[/\bCome join us the first Thursday of the month for our\b/gi, "Come join us for our"]],
  },
  // This listing republishes a ©2000–2003 film page's "currently" claim.
  // Bravo and IFC are separate networks; no current broadcast rights were
  // verified. Remove that clause and the same page's undated "recent" office
  // move, preserving the sourced 1993 Cinemax history.
  // Also restore the funder's source spelling after the prose splitter.
  // https://www.empowermentproject.org/pages/panama.html
  // Evidence: docs/qa/2026-10-20-1607-fact-check.md.
  {
    date: "2026-12-03",
    url: "https://paloalto.bibliocommons.com/events/6a61028ecca66c2f00a54304",
    aliasUrls: ["https://paloalto.bibliocommons.com/v2/events/6a61028ecca66c2f00a54304"],
    copyReplacements: [
      [/\s*EP has recently moved its offices out of New York and California\.\s+The new headquarters for all operations is now in Chapel Hill, North Carolina\./i, ""],
      [/\s+and currently,\s*Bravo\s*[-–—]\s*the Independent\s*Film Channel retains the rights to cablecast the film\./i, "."],
      [/\s*Currently,\s*Bravo\s*\(the Independent Film Channel\) retains the rights to cablecast the film\./i, ""],
      [/\bI\. Roderick Mac Arthur Foundation\b/g, "I. Roderick MacArthur Foundation"],
    ],
  },
  // Stanford's complete page identifies a free exhibition, not a talk.
  // Keep its published occurrence clocks; the description also names the
  // gallery hours and Thanksgiving closure omitted by the sparse feed.
  // https://events.stanford.edu/event/tangling-the-digital-weaving-printmaking-computing
  // Evidence: docs/qa/2026-10-20-1407-fact-check.md.
  {
    dateFrom: "2026-09-29", dateThrough: "2026-12-04",
    url: "https://events.stanford.edu/event/tangling-the-digital-weaving-printmaking-computing",
    facts: {
      category: "arts", cost: "free",
      description: "Free exhibition exploring weaving, printmaking, and computing at Coulter Art Gallery in the McMurtry Building. On view September 29–December 4, 2026, Monday–Friday, 1–5 PM; closed November 23–27.",
      blurb: "Visit a free exhibition exploring weaving, printmaking, and computing at Coulter Art Gallery.",
    },
  },
  // Stanford's current program gives Friday, October 23 at 7 and 9 PM.
  // Correct the stale October 21 newsletter date before the past-date gate
  // and URL/date/time dedup, preserving both real performance clocks.
  // https://live.stanford.edu/events/26-27season/studio/jontavious-willis/
  // Evidence: docs/qa/2026-10-19-1707-fact-check.md.
  {
    date: "2026-10-21",
    url: "https://live.stanford.edu/events/26-27season/studio/jontavious-willis/",
    facts: { date: "2026-10-23", category: "music" },
  },
  {
    date: "2026-10-23",
    url: "https://live.stanford.edu/events/26-27season/studio/jontavious-willis/",
    facts: { category: "music" },
  },
  // The organizer places this fan fest in the hammer-throw area outside
  // Stanford Stadium. Free T-shirts do not establish free admission.
  // https://gostanford.com/the-crossover-2026
  {
    date: "2026-10-23",
    url: "https://gostanford.com/the-crossover-2026",
    facts: {
      venue: "Cobb Track and Angell Field — Hammer Throw area",
      address: "",
      kidFriendly: true,
    },
    copyReplacements: [[/^A free outdoor preseason basketball event\b/, "An outdoor preseason basketball event"]],
  },
  // The organizer's opening-night page gives 5–9 PM at Hotel Valencia,
  // 355 Santana Row. The calendar parser previously took 9 PM as the start
  // and supplied the shopping district's generic 377 Santana Row address.
  // https://santanarow.com/event/cielo-hotel-valencia-rooftop-holiday-experience/
  // Evidence: docs/qa/2026-10-19-1707-fact-check.md.
  {
    date: "2026-11-27",
    url: "https://santanarow.com/event/cielo-hotel-valencia-rooftop-holiday-experience/",
    facts: {
      time: "5:00 PM",
      endTime: "9:00 PM",
      venue: "Cielo Rooftop at Hotel Valencia",
      address: "355 Santana Row, San Jose, CA 95128",
    },
  },
  // The dated organizer page and complete RSS body agree on paid admission
  // and an 8 PM performance. MEC's 7:30 PM start is doors, and the adapter
  // formerly labeled every MACLA event free. Protect sparse intake too.
  // https://maclaarte.org/events/volveralaluz/
  // Evidence: docs/qa/2026-10-19-0607-fact-check.md.
  {
    date: "2026-10-23",
    url: "https://maclaarte.org/events/volveralaluz/",
    facts: {
      time: "8:00 PM",
      cost: "paid",
      costNote: "General admission $30; $10 student pay-what-you-can tickets; reserved seating $50 or $75.",
      attendanceNote: "Doors open at 7:30 PM; performance starts at 8 PM.",
    },
  },
  // The freshly read organizer calendar replaces the author launch with a
  // bookseller-led club for ages 9+. Its body asks readers to RSVP by email
  // and says Kate cannot attend; the heading-only scraper omits these facts.
  // Match title + venue, not the calendar URL shared by other events that day.
  // https://www.lindentreebooks.com/events-calendar/
  // Evidence: docs/qa/2026-10-19-0407-fact-check.md.
  {
    date: "2026-10-25",
    title: /^Middle Grade Book Club: Brittle Magic$/i,
    venue: /^Linden Tree Books$/i,
    facts: {
      registration: REGISTRATION_REQUIRED,
      kidFriendly: true,
      attendanceNote: "For ages 9 and up. RSVP by email using the organizer's calendar. Kate O'Shaughnessy will not attend.",
    },
  },
  // The museum's dated dedication page says free with RSVP. The published
  // description omits that line, and the adapter defaulted to paid with no
  // signup requirement. Preserve the full-page admission facts through refreshes.
  // https://www.jamsj.org/upcoming-events/cgm-dedication
  // Evidence: docs/qa/2026-10-18-2207-fact-check.md.
  {
    date: "2026-11-14",
    url: "https://www.jamsj.org/upcoming-events/cgm-dedication",
    facts: {
      cost: "free",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free with RSVP. See the museum's event page for signup details.",
    },
  },
  // The city's dated program supersedes an earlier newsletter's 4:30 PM end.
  // Match the raw intake location too so a replacement ID keeps the source link.
  // https://www.paloalto.gov/Events-Directory/Community-Services/2026-Fall-Family-Day
  // Evidence: docs/qa/2026-10-18-2107-fact-check.md.
  {
    date: "2026-10-18",
    title: /^(?:2026 )?Fall Family Day$/i,
    venue: /^Palo Alto Art Center(?:,.*)?$/i,
    facts: {
      endTime: "4:15 PM",
      url: "https://www.paloalto.gov/Events-Directory/Community-Services/2026-Fall-Family-Day",
      cost: "free",
    },
  },
  // The organizer and market identify the same November 7, noon–4 PM event
  // at 87 N. San Pedro. A newsletter's extra "Festival" and omitted accent
  // kept it separate from the organizer's listing in cross-source dedupe.
  // https://historysanjose.org/programs-events/
  // https://sanpedrosquaremarket.com/calendar/san-jose-roots-1
  // Evidence: docs/qa/2026-10-18-2007-fact-check.md.
  {
    date: "2026-11-07",
    title: /^San Jos[ée] Roots(?: Festival)?$/i,
    venue: /^(?:Gonzales\/Peralta Adobe|San Pedro Square Market|History Park)(?:,.*)?$/i,
    facts: {
      title: "San José Roots",
      venue: "Gonzales/Peralta Adobe",
      address: "87 N San Pedro St., San José",
      url: "https://historysanjose.org/event/san-jose-roots/",
      cost: "free",
    },
    // The program names the Adobe and Fallon House, rather than multiple
    // adobe homes, and does not substantiate the extracted anniversary claim.
    // Evidence: docs/qa/2026-10-31-1807-fact-check.md (fresh organizer page).
    copyReplacements: [
      [/\bhistoric adobe homes\b/gi, "historic homes"],
      [/,\s+kicking off the city['’]s 250th anniversary with\b/gi, ", with"],
      [/\s+marking San Jos[ée]['’]s 250th\b/gi, ""],
    ],
  },
  // A newsletter copy displaced the city's linked occurrence during dedupe.
  // Match its date/title/venue so a new intake ID cannot restore a blank link.
  // https://www.saratoga.ca.us/Calendar.aspx?EID=2695
  // Evidence: docs/qa/2026-10-18-2007-fact-check.md.
  {
    date: "2026-10-18",
    title: /^Flag Retirement Ceremony$/i,
    venue: /^Blaney Plaza(?:, Downtown Saratoga)?$/i,
    facts: { url: "https://www.saratoga.ca.us/Calendar.aspx?EID=2695" },
  },
  // Evergreen's dated occurrences are October 19 (Monday) and October 20
  // (the third Tuesday), while their bilingual body repeats a fourth-Tuesday
  // schedule. Keep both sessions and the separate Friday programming; omit
  // only the conflicting clauses.
  // Evidence: docs/qa/2026-10-18-1707-fact-check.md.
  ...[
    ["2026-10-19", "6a555243dee4ff5300c93bf4"],
    ["2026-10-20", "6a5553c764ed854800a5510a"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
    copyReplacements: [
      [/,\s+plus a special bilingual session on the fourth Tuesday of each month\b/gi, ""],
      [/;\s*riêng thứ Ba tuần thứ tư hằng tháng sẽ có chương trình kể chuyện song ngữ đặc biệt/gi, ""],
    ],
  })),
  // This BioBlitz uses the Milpitas section of a trail spanning several cities.
  // The dated organizer page names the Ranch Drive entrance; its volunteer
  // listing requires Eventbrite registration. A trail name alone is not a city.
  // Evidence: docs/qa/2026-10-18-0807-fact-check.md.
  {
    date: "2026-10-18",
    url: "https://www.eventbrite.com/e/coyote-creek-trail-bioblitz-tickets-1999128802062?aff=post",
    aliasUrls: [
      "https://www.eventbrite.com/e/coyote-creek-trail-bioblitz-tickets-1999128802062",
      "https://261018-bioblitz.eventbrite.com/",
    ],
    facts: {
      city: "milpitas",
      venue: "Coyote Creek Trail",
      address: "Ranch Dr. and Alviso Milpitas Rd, Milpitas, CA 95035",
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "Register through Keep Coyote Creek Beautiful's Eventbrite page before attending. Meet at the Ranch Drive entrance near Alviso Milpitas Road.",
    },
  },
  // SJPL's dated Edenvale occurrence says "in English or 中文". Older
  // snapshots lost the Chinese label or sentence during display cleanup.
  // Do not infer a dialect or carry this into other dates or branches.
  // Evidence: docs/qa/2026-10-18-0707-fact-check.md.
  {
    date: "2026-10-20",
    url: "https://sjpl.bibliocommons.com/events/6a07b6ef278f7c2f008d79d9",
    copyReplacements: [
      [/\bOffered in(?:-| )person, in English(?: or)?\./gi, "Offered in person, in English or Chinese."],
      [/^Free\.(?=\s+Would you like to find out more about computers\?)/, "Free. Offered in person, in English or Chinese."],
    ],
  },
  // The organizer's TicketWeb occurrence explicitly marks this show SOLD OUT.
  // Protect sparse/stale copies too, even if they omit the title's status prefix.
  // Evidence: docs/qa/2026-10-18-0607-fact-check.md.
  {
    date: "2026-11-12",
    url: "https://www.ticketweb.com/event/sold-out-tauren-wells-air1-cathedral-of-faith-tickets/14232924",
    facts: {
      registration: REGISTRATION_FULL,
      attendanceNote: "Tickets are sold out according to the ticket seller.",
    },
  },
  // The complete museum iCal body and occurrence page agree that physical
  // seats are full, with Zoom registration still available. Protect this
  // occurrence while older official-source snapshots lack attendance fields.
  // Evidence: docs/qa/2026-10-18-0507-fact-check.md.
  {
    date: "2026-10-21",
    url: "https://www.losaltoshistory.org/events/not-quite-created-equal-who-got-left-out-of-the-declaration-of-independence/",
    facts: {
      registration: REGISTRATION_FULL,
      attendanceNote: "In-person attendance is full. Register through the museum's event page to attend via Zoom.",
    },
  },
  // The same conflicting term copy reached November 4 under a new source ID.
  // Match the source-listed Mon/Wed program and both stale ranges, within
  // this term, so new occurrences receive the same caution. This never
  // creates dates or changes corrected source text or enrollment status.
  // Evidence: docs/qa/2026-10-18-0407-fact-check.md and
  // docs/qa/2026-10-20-1407-fact-check.md.
  {
    dateFrom: "2026-10-19", dateThrough: "2026-11-18",
    matches: (event) => (!event.city || event.city === "milpitas")
      && /^Free Adult ESL Class(?: at Milpitas Library)?$/i.test(event.title || "")
      && /^Milpitas Library$/i.test(event.venue || "")
      && /^https:\/\/sccl\.bibliocommons\.com\/(?:v2\/)?events\/[a-f0-9]{24}$/.test(event.url || "")
      && [1, 3].includes(new Date(`${event.date}T12:00:00Z`).getUTCDay())
      && /\bFebruary 9(?:th)? (?:to|and) May 20(?:th)?\b/i.test(event.description || "")
      && /\bClass Dates:\s*August 17(?:th)?,\s*2025\s*[-–—]\s*November 18(?:th)?,\s*2026\b/i.test(event.description || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library lists July 27–August 19 assessment dates and conflicting class date ranges. Confirm class and enrollment details with Milpitas Library.",
    },
    copyReplacements: [
      [/\s+(?:between|from) February 9(?:th)? (?:to|and) May 20(?:th)?/gi, ""],
      [/\bClass Dates:\s*August 17(?:th)?,\s*2025\s*[-–—]\s*November 18(?:th)?,\s*2026,\s*Mon\s*&\s*Weds\s*6:00\s*PM\s*[-–—]\s*8:00\s*PM\.\s*/gi, ""],
      [/\s*ESL assessment dates: July 27th - August 19th\./gi, ""],
      [/\bPlease (?:follow the link to )?make an appointment for your ESL assessment(?::\s*https:\/\/outlook\.office\.com\/boo\.{3}|\.)/gi, "Confirm assessment and enrollment availability with Milpitas Library."],
    ],
  },
  // Newsletter intake carried 8 PM and omitted usable concert links. The
  // organizer's occurrence pages and ticket pages agree on 7:30 PM. Match
  // the dated title/venue too so a different intake ID cannot undo the facts.
  // Evidence: docs/qa/2026-10-18-0307-fact-check.md.
  {
    date: "2027-03-16",
    id: "inbound-b0382cebabec4e42",
    title: /^(?:The )?Buena Vista Orchestra$/i,
    venue: /^(?:The )?Carriage House(?: Theatre)?$/i,
    url: "https://montalvoarts.org/experience/carriage-house-concerts/the-buena-vista-orchestra/",
    facts: {
      time: "7:30 PM",
      url: "https://montalvoarts.org/experience/carriage-house-concerts/the-buena-vista-orchestra/",
    },
  },
  {
    date: "2027-04-16",
    id: "inbound-2d2899ec28bc302e",
    title: /^Peter Asher(?:: Songs and Stories)?$/i,
    venue: /^(?:The )?Carriage House(?: Theatre)?$/i,
    url: "https://montalvoarts.org/experience/carriage-house-concerts/peter-asher-songs-and-stories/",
    facts: {
      // The organizer identifies a pop/rock concert, rather than general arts.
      // Evidence: docs/qa/2026-10-24-1007-fact-check.md.
      category: "music",
      time: "7:30 PM",
      url: "https://montalvoarts.org/experience/carriage-house-concerts/peter-asher-songs-and-stories/",
    },
  },
  // Replace blank/dead newsletter links only for these verified concerts.
  // Do not redirect every stanfordlive.stanford.edu link to one performance.
  // Evidence: docs/qa/2026-10-18-0307-fact-check.md.
  {
    date: "2027-03-19",
    id: "inbound-8fa96b196b0649cd",
    title: /^The Spinners$/i,
    venue: /^Heritage Theatre$/i,
    facts: { url: "https://www.heritagetheatre.org/2026-2027-season-of-shows" },
  },
  {
    date: "2027-03-13",
    id: "inbound-ee6230957f50486c",
    title: /^Stanley Clarke and Hiromi with (?:the )?PUBLIQuartet$/i,
    venue: /^Bing Concert Hall$/i,
    facts: { url: "https://live.stanford.edu/events/26-27season/bing-concert-hall/stanley-clarke-and-hiromi-with-the-publiquartet/" },
  },
  {
    date: "2027-04-03",
    id: "inbound-46189d1f46f2ac9d",
    title: /^Jack West: Guitars on Life$/i,
    venue: /^The Studio$/i,
    // Stanford Live confirms a guitar concert. Keep sparse newsletter rows
    // out of the community catch-all. Evidence: 2026-10-24-1007-fact-check.md.
    facts: { category: "music", url: "https://live.stanford.edu/events/26-27season/studio/jack-west-guitars-on-life/" },
  },
  // The library's title spells saranggola correctly; its body misspells it.
  // Keep the carried attendance note and cached blurb consistent too.
  // Evidence: docs/qa/2026-10-18-0107-fact-check.md (fresh occurrence HTML).
  {
    date: "2026-10-26",
    url: "https://sccl.bibliocommons.com/events/6ab70960d6cf1f1a037de276",
    facts: {
      blurb: "Make a simple Filipino saranggola kite with other kids to celebrate Filipino heritage month.",
    },
    copyReplacements: [[/\bsarrangola\b/gi, "saranggola"]],
  },
  // The occurrence's location field names Conference Room, while its body
  // names the second-floor Technology Lab. Neither establishes the room.
  // Keep the confirmed library venue and disclose the conflict without
  // choosing a room or carrying the definite direction into generated copy.
  // Evidence: docs/qa/2026-10-18-0107-fact-check.md (fresh occurrence HTML).
  {
    date: "2026-11-03",
    url: "https://losgatosca.libcal.com/event/17036748",
    facts: {
      blurb: "Make a dropper-art gratitude tree with instructor Makiko Niwa after a brief guided meditation.",
      attendanceNote: "The library's location field says Conference Room, but its description says the second-floor Technology Lab. Confirm the room with the library.",
    },
    copyReplacements: [[/\s*This class will take place in the Technology Lab on the 2nd floor\./gi, ""]],
  },
  // These Bascom occurrence pages explicitly say registration is
  // recommended but not required. The presence/deadline of their signup form
  // does not establish an admission requirement. Keep this exception dated;
  // do not relax the conservative provider rule for other library programs.
  // Evidence: docs/qa/2026-10-17-2107-fact-check.md (fresh occurrence HTML)
  // and docs/qa/2026-10-25-1407-fact-check.md (the October 27 source record),
  // docs/qa/2026-10-31-0107-fact-check.md (the November 3 source record).
  ...[
    ["2026-10-18", "6a85eaec69166f088b934e2d"],
    ["2026-10-20", "6a83713669166f088b92df77"],
    ["2026-10-27", "6a83713669166f088b92df78"],
    ["2026-11-03", "6a83713669166f088b92df79"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
    facts: {
      registration: REGISTRATION_NONE,
      registrationClosesBy: null,
      attendanceNote: "Registration is recommended but not required.",
    },
  })),
  // These six occurrence pages explicitly close enrollment for the same
  // August 31–November 4 semester. Missing registrar metadata is not evidence
  // of walk-up admission. Keep the class listed with its actual signup state;
  // do not carry this closure into another semester or another branch.
  // Evidence: docs/qa/2026-10-17-2007-fact-check.md and
  // docs/qa/2026-10-17-2207-fact-check.md (the retained briefing occurrence).
  ...[
    ["2026-10-14", "6a5a9d66f4e5db3d00c27e15"],
    ["2026-10-19", "6a5a9d66f4e5db3d00c27e16"],
    ["2026-10-21", "6a5a9d66f4e5db3d00c27e17"],
    ["2026-10-26", "6a5a9d66f4e5db3d00c27e18"],
    ["2026-10-28", "6a5a9d66f4e5db3d00c27e19"],
    ["2026-11-02", "6a5a9d66f4e5db3d00c27e1a"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sccl.bibliocommons.com/events/${sourceId}`,
    facts: {
      registration: REGISTRATION_CLOSED,
      attendanceNote: "Registration is closed for this class session. Check back with the library in January for spring classes.",
    },
  })),
  // Preserve the university's published initials in titles and cached blurbs.
  // The shared title normalizer now also preserves uppercase source tokens.
  // Evidence: docs/qa/2026-10-17-2007-fact-check.md (fresh university HTML).
  {
    date: "2026-10-19",
    url: "https://events.stanford.edu/event/ese-seminar-ines-azevedo-what-is-the-stanford-woods-institute-for-the-environment-a-journey-into-the-worlds-most-pressing-environmental-problems",
    facts: { title: "ESE Seminar - Inês Azevedo" },
    copyReplacements: [[/\bEse(?= Seminar\b)/g, "ESE"]],
  },
  {
    date: "2026-10-23",
    url: "https://events.scu.edu/leavey-school-of-business/event/518247-isa-research-seminar-vahid-akbari-university-of",
    facts: { title: "ISA Research Seminar: Vahid Akbari (University of Nottingham)" },
    copyReplacements: [[/\bIsa(?= Research Seminar\b)/g, "ISA"]],
  },
  {
    date: "2026-10-19",
    url: "https://events.stanford.edu/event/st-lee-lecture-featuring-former-congressman-and-ambassador-to-turkey-jeff-flake",
    // The full occurrence text requires registration; the short feed excerpt
    // ends before that sentence. An omitted field is not walk-up permission.
    facts: {
      registration: REGISTRATION_REQUIRED,
      attendanceNote: "This event is open to the public. Registration is required.",
    },
    copyReplacements: [[/\bSt(?= Lee Lecture\b)/g, "ST"]],
  },
  // Newsletter extraction put Saratoga's puppet show on October 17 at 11 AM.
  // The library's occurrence page gives October 19, 4–4:30 PM. Correct before
  // date filtering/deduplication so the official Monday listing wins and the
  // false Saturday occurrence cannot return with a different intake ID.
  // https://sccl.bibliocommons.com/events/6abc4d747c8c150075767bd5
  // Evidence: docs/qa/2026-10-17-1407-fact-check.md.
  // Include the corrected date because inbound presentation fixes the clock
  // and date first, then the publication pass applies the remaining facts.
  ...["2026-10-17", "2026-10-19"].map((date) => ({
    date,
    title: /^Fratello Marionettes(?::| Present(?:s)?) Spooktacular(?: \(All Ages\))?$/i,
    venue: /^Saratoga Library(?:,.*)?$/i,
    facts: {
      title: "Fratello Marionettes: Spooktacular",
      date: "2026-10-19", displayDate: "Mon, Oct 19",
      time: "4:00 PM", endTime: "4:30 PM",
      url: "https://sccl.bibliocommons.com/events/6abc4d747c8c150075767bd5",
      cost: "free", category: "community", kidFriendly: true, audienceAge: "all",
    },
  })),
  // The city newsletter explicitly confirms the donation drive, including
  // its 10 AM–4 PM hours. Link the retained source instead of a blank URL.
  // https://saratoga.ca.us/CivicSend/ViewMessage/message/303691
  {
    date: "2026-10-17",
    title: /^Friends of the Saratoga Libraries Book Donation Event$/i,
    venue: /^Saratoga Library(?:,.*)?$/i,
    facts: { url: "https://saratoga.ca.us/CivicSend/ViewMessage/message/303691" },
  },
  // The county explicitly describes this ride as all ages and family-friendly.
  // Keep its first-party event page instead of the newsletter tracking link;
  // the festival's 10 AM start is not evidence of the ride's departure time.
  // https://d3.santaclaracounty.gov/dayonthebay2026
  // Evidence: docs/qa/2026-10-17-0407-fact-check.md.
  {
    date: "2026-10-17", id: "inbound-5a0ec185106f165a",
    title: /^Bike to the Bay Ride$/i, venue: /\bW(?:est)?\.?\s+Hedding\b/i,
    facts: { kidFriendly: true, url: "https://d3.santaclaracounty.gov/dayonthebay2026" },
  },
  // All three library pages give grades 3–8 in the title but grades 2–7 only
  // in the description. Neither range establishes eligibility. Omit both
  // definitive limits and disclose the source conflict without choosing one.
  // Preserve the group's own NeuroSphere styling; this runs after title cleanup.
  // Evidence: docs/qa/2026-10-17-0107-fact-check.md (fresh occurrence HTML).
  ...[
    ["2026-10-18", "6a384108c134422d50e9a7b1"],
    ["2026-11-15", "6a384108c134422d50e9a7b2"],
    ["2026-12-20", "6a384108c134422d50e9a7b3"],
  ].map(([date, sourceId]) => ({
    date, url: `https://paloalto.bibliocommons.com/events/${sourceId}`,
    facts: {
      title: "NeuroSphere: Neuroscience and More!",
      blurb: "Join teen-led NeuroSphere to dig into brain function basics and test your brainpower with hands-on activities.",
      attendanceNote: "The library's title lists grades 3–8, but its description says grades 2–7 only. Confirm eligibility with Mitchell Park Library.",
    },
    copyReplacements: [
      [/\bNeuroSphere is a community for (?:curious 2nd-7th graders about medicine|2nd-7th graders curious about medicine)!\s*/gi, ""],
      [/\s*This program is open for 2nd-7th graders only\./gi, ""],
    ],
  })),
  // The library's shared reading-list body misspells Backman's surname and
  // calls Kurkov an International Booker winner. The publisher identifies
  // Fredrik Backman; the prize organizer records Kurkov as a judge/longlistee.
  // Keep the author's name and omit the unsupported accolade on these dates.
  // https://www.simonandschuster.com/books/My-Friends/Fredrik-Backman/9781982112837
  // https://thebookerprizes.com/the-booker-library/authors/andrey-kurkov
  // Evidence: docs/qa/2026-10-17-0007-fact-check.md.
  ...[
    ["2026-11-12", "6759fea0da3a5e3d00ca4d1a"],
    ["2026-12-10", "6759fea0da3a5e3d00ca4d1b"],
  ].map(([date, sourceId]) => ({
    date, url: `https://paloalto.bibliocommons.com/events/${sourceId}`,
    copyReplacements: [
      [/\bFredrik Bachman\b/gi, "Fredrik Backman"],
      [/\bInternational Booker Prize winner Andrey Kurkov\b/gi, "Andrey Kurkov"],
    ],
  })),
  // Hammer's VBO card reuses an ABBA intro for the Halloween concert. Fever's
  // own program identifies Halloween music performed by a string quartet.
  // Apply before blurb resolution so the misleading cached copy cannot return.
  // https://feverup.com/m/140936
  // Evidence: docs/qa/2026-10-16-0407-fact-check.md.
  {
    date: "2026-10-30", url: "https://feverup.com/m/140936",
    facts: {
      description: "A string quartet performs Halloween-inspired music by candlelight at Hammer Theatre Center.",
      blurb: "Hear a string quartet play Halloween-inspired music by candlelight at Hammer Theatre.",
    },
  },
  // The same VBO template omits Queen from November's intro and January's
  // title. The organizer explicitly lists both dates under Queen vs. ABBA.
  // https://feverup.com/m/415717
  // Evidence: docs/qa/2026-10-16-0407-fact-check.md.
  ...["2026-11-29", "2027-01-31"].map((date) => ({
    date, url: "https://feverup.com/m/415717",
    facts: {
      title: "Fever presents Candlelight: Queen vs. ABBA",
      description: "A string quartet performs music by Queen and ABBA by candlelight at Hammer Theatre Center.",
      blurb: "Hear a candlelit tribute concert covering Queen and ABBA classics performed live.",
    },
  })),
  // The exhibition runs October 5–November 5, but performances and artist
  // presentations belong to its October 8 reception, already past. Bound
  // the correction to this run so daily re-anchoring cannot restore it.
  // https://events.sjsu.edu/event/art-of-remembrance-ofrenda-exhibit-2026
  // Evidence: docs/qa/2026-10-16-0307-fact-check.md.
  {
    dateFrom: "2026-10-09", dateThrough: "2026-11-05",
    url: "https://events.sjsu.edu/event/art-of-remembrance-ofrenda-exhibit-2026",
    facts: {
      description: "View ofrendas created by local artists, offering perspectives on traditional and contemporary visual arts.",
      blurb: "See ofrendas made by local artists at King Library.",
    },
  },
  // The organizer moved this event to November 1 at ICC and requires advance
  // signup/payment. Its listener discount conflicts with its later fee text,
  // so leave the price unspecified rather than choosing one.
  // https://www.meetup.com/masalamic/events/316730245/
  // Evidence: docs/qa/2026-10-16-0307-fact-check.md.
  {
    date: "2026-11-01", url: "https://www.meetup.com/masalamic/events/316730245/",
    facts: {
      registration: "required",
      attendanceNote: "Advance signup and payment required; no children under 10. Check the organizer for singer availability and current fees.",
    },
  },
  // The organizer describes season-dependent restoration, not an October
  // promise of weed pulling. RSVP confirms the workday; first-timers need a
  // signed waiver. Evidence: docs/qa/2026-10-16-0307-fact-check.md.
  // https://www.meetup.com/california-native-plant-society-santa-clara-valley-chapter/events/316736813/
  {
    date: "2026-10-17", url: "https://www.meetup.com/california-native-plant-society-santa-clara-valley-chapter/events/316736813/",
    facts: {
      blurb: "Help restore habitat at Cataldi Park with the California Native Plant Society.",
      registration: "required",
      attendanceNote: "RSVP to confirm the workday and check updates Friday night. First-time volunteers must bring a signed waiver.",
    },
  },
  // This is an improv meetup led by a group member; the source does not
  // establish a spectator performance or audience-suggestion format.
  // https://www.meetup.com/southbayimprovfun/events/316792378/
  // Evidence: docs/qa/2026-10-16-0307-fact-check.md.
  {
    date: "2026-10-19", url: "https://www.meetup.com/southbayimprovfun/events/316792378/",
    facts: { blurb: "Join South Bay Improv Fun for an improv meetup at the Mountain View Community Center." },
  },
  // These first-party descriptions explicitly call the event free even
  // though Localist leaves `free` false and `ticket_cost` blank. Preserve
  // that evidence without treating unrelated free food or student perks as
  // admission. Evidence: docs/qa/2026-10-16-0307-fact-check.md.
  ...[
    ["2026-10-20", "humhonculturecon-movie-event-jai-bhim-2021"],
    ["2026-10-23", "2026-sjsu-responsible-innovation-in-ai-conference"],
  ].map(([date, slug]) => ({
    date, url: `https://events.sjsu.edu/event/${slug}`, facts: { cost: "free" },
  })),
  // Stanford organizes transportation, so this field trip retains its Palo
  // Alto departure bucket. Its destination's postal locality is San José.
  // https://events.stanford.edu/event/environmental-humanities-project-field-trip-reimagining-our-waterways-climate-and-art-symposium
  // Evidence: docs/qa/2026-10-15-2107-fact-check.md.
  {
    date: "2026-10-16", url: "https://events.stanford.edu/event/environmental-humanities-project-field-trip-reimagining-our-waterways-climate-and-art-symposium",
    facts: { venue: "San José Museum of Art", locality: "San José" },
  },
  // https://www.moah.org/moahevents/repair-cafe-of-silicon-valley-2
  // The detail page explicitly says FREE; the sparse listing defaulted to paid.
  // Evidence: docs/qa/2026-10-15-2107-fact-check.md.
  {
    date: "2026-11-08", url: "https://www.moah.org/moahevents/repair-cafe-of-silicon-valley-2",
    facts: {
      cost: "free",
      attendanceNote: "Limit two items per household. Check-in closes at 2:30 PM and may close earlier if capacity is reached.",
    },
  },
  // The current organizer listing places the tea at the Empire Fire House,
  // not outdoors. The old booking URL is dated December 2024.
  // https://historysanjose.org/programs-events/
  // Evidence: docs/qa/2026-10-15-2107-fact-check.md.
  {
    date: "2026-12-05", title: /^History Park Heritage Holiday Tea$/i,
    venue: /^History Park(?:, Empire Fire House)?$/i,
    facts: {
      url: "https://historysanjose.org/programs-events/",
      category: "community",
      blurb: "Join the Heritage Holiday Tea at History Park's Empire Fire House.",
    },
  },
  // Correct the already published phantom date on its retired URL too. The
  // December 10 record came from an image filename, not another tea session.
  {
    date: "2026-12-10", id: "historysj-f6db24f857516c7b",
    facts: {
      date: "2026-12-05", displayDate: "Sat, Dec 5",
      url: "https://historysanjose.org/programs-events/",
      category: "community",
      blurb: "Join the Heritage Holiday Tea at History Park's Empire Fire House.",
    },
  },
  // This event's Squarespace location incorrectly says Palo Alto / 94301.
  // The bookstore's contact page confirms 1010 El Camino Real in Menlo Park,
  // 94025; the foundation's attendee FAQ also identifies its in-store venue.
  // Keep the established palo-alto coverage bucket for this border venue.
  // https://keplers.com/contact
  // https://www.keplers.org/attendee-faq
  // Evidence: docs/qa/2026-10-15-1707-fact-check.md.
  {
    date: "2026-10-24", url: "https://www.keplers.org/upcoming-events-internal/community-reads",
    facts: { address: "1010 El Camino Real, Menlo Park, CA 94025", locality: "Menlo Park" },
  },
  // NUMU's program details confirm Thursday, November 19, 11–11:45 AM,
  // free with registration. The newsletter's stale summer offset labeled its
  // midnight sentinel November 18, and omitted the required reservation.
  // https://www.numulosgatos.org/events/cassady
  // Evidence: docs/qa/2026-10-15-1507-fact-check.md.
  // NUMU misspells the speaker's surname; his own newspaper's notice of this
  // same talk identifies Dan Pulcrano. Correct source and cached copy alike.
  // https://losgatan.com/march-came-in-like-a-lamb-but-whats-next/
  // Evidence: docs/qa/2026-10-15-1607-fact-check.md.
  {
    date: "2026-11-19", url: "https://www.numulosgatos.org/events/cassady",
    facts: {
      displayDate: "Thu, Nov 19", time: "11:00 AM", endTime: "11:45 AM",
      cost: "free", registration: "required", attendanceNote: "Free with registration.",
    },
    copyReplacements: [[/\bDan Pulcano\b/g, "Dan Pulcrano"]],
  },
  // The companion October talk also requires registration; the newsletter
  // omitted that condition and its 11:45 AM closing time. Do not infer those
  // terms for other NUMU programs from their shared series title.
  // https://www.numulosgatos.org/events/canneries
  // Evidence: docs/qa/2026-10-15-1607-fact-check.md.
  {
    date: "2026-10-15", url: "https://www.numulosgatos.org/events/canneries",
    facts: {
      endTime: "11:45 AM", cost: "free", registration: "required", attendanceNote: "Free with registration.",
    },
  },
  // FOPAL's dated 2026 schedule says November 14–15; the library's external
  // Sunday listing incorrectly says November 8. Its Sunday hours agree with
  // FOPAL's sale information. Correct the date from the organizer's schedule,
  // not from recurrence arithmetic, and link that primary evidence.
  // https://www.fopal.org/2026-book-sale-dates
  // https://www.fopal.org/book-sale-info
  // Evidence: docs/qa/2026-10-15-1307-fact-check.md.
  {
    date: "2026-11-08", url: "https://paloalto.bibliocommons.com/events/69667a0394297d3600a4e8a0",
    facts: { date: "2026-11-15", displayDate: "Sun, Nov 15", url: "https://www.fopal.org/2026-book-sale-dates" },
  },
  // The library conflates Kepler's candidate sample with confirmed planets.
  // NASA's archive distinguishes 2,787 confirmed Kepler discoveries from the
  // larger candidate sample. Avoid both the conflation and a live count here.
  // https://exoplanetarchive.ipac.caltech.edu/docs/counts_detail.html
  // https://sccl.bibliocommons.com/events/6aa329f860748300382614b2
  // Evidence: docs/qa/2026-10-15-1307-fact-check.md.
  {
    date: "2026-10-15", url: "https://sccl.bibliocommons.com/events/6aa329f860748300382614b2",
    copyReplacements: [[/NASA['’]s Kepler mission discovered over 4,400 transiting planets around other stars, including over 700 systems with multiple planets\./gi, "NASA's Kepler mission identified thousands of planets and planet candidates around other stars, including multi-planet systems."]],
  },
  // The series names tech tutors, not librarians. Its cached blurb invented
  // the staff role; preserve the source's wording on the verified sessions.
  // https://sjpl.bibliocommons.com/events/68df10f9023ff328007ce8c8
  // Evidence: docs/qa/2026-10-15-1307-fact-check.md and
  // docs/qa/2026-10-20-1807-fact-check.md.
  ...[
    ["2026-10-15", "68df10f9023ff328007ce8c8"],
    ["2026-10-17", "68df10f9023ff328007ce8c9"],
    ["2026-10-24", "68df10f9023ff328007ce8cc"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
    copyReplacements: [
      [/\bfrom a librarian at Willow Glen Library\b/gi, "from a tech tutor at Willow Glen Library"],
      [/\bwith library staff\b/gi, "with a tech tutor"],
    ],
  })),
  // The library's occurrence confirms October 18, the third Sunday, while its
  // shared body says fourth Sunday. Keep the dated session and walk-in terms.
  // https://sjpl.bibliocommons.com/events/6a02128243b41b3d0065b38d
  // Evidence: docs/qa/2026-10-15-1207-fact-check.md.
  {
    date: "2026-10-18", url: "https://sjpl.bibliocommons.com/events/6a02128243b41b3d0065b38d",
    copyReplacements: [[/\s+every fourth Sunday of the month\b/gi, ""]],
  },
  // The occurrence and explicit date list confirm October 20, the third
  // Tuesday. Omit the incompatible second-Tuesday clause; preserve signup,
  // caregiver participation, age limits, and every published series date.
  // https://sccl.bibliocommons.com/events/6a68e7ccf4e5db3d00c4dc6a
  // Evidence: docs/qa/2026-10-15-1207-fact-check.md.
  {
    date: "2026-10-20", url: "https://sccl.bibliocommons.com/events/6a68e7ccf4e5db3d00c4dc6a",
    copyReplacements: [[/\bJoin us every second Tuesday of the month\*? at Milpitas for our\b/gi, "Join us at Milpitas for our"]],
  },
  // The dated October sessions are October 21/22. October 21 is the third
  // Wednesday, so the shared fourth-Wednesday boilerplate conflicts with it.
  // Keep the explicit dates and omit the cadence rather than move a session.
  // Evidence: docs/qa/2026-10-15-1207-fact-check.md.
  ...[
    ["2026-10-21", "6a4c9f94541102b7fa8aea8d"],
    ["2026-10-22", "6a4c9f94541102b7fa8aea8e"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sccl.bibliocommons.com/events/${sourceId}`,
    copyReplacements: [[/\bThe Milpitas Library Book Discussion Group meets on the 4th Wednesday morning and 4th Thursday evening of each month with the exception of November and December, when we will reschedule to accommodate holiday schedules\.\s*/gi, ""]],
  })),
  // The October Cafecito occurrence is on the third Thursday, and its
  // Location is Technology Lab. The bilingual body repeats a second-Thursday
  // cadence and conference-room directions; omit those conflicting clauses.
  // https://losgatosca.libcal.com/event/16035613
  // Evidence: docs/qa/2026-10-15-1207-fact-check.md.
  {
    date: "2026-10-15", url: "https://losgatosca.libcal.com/event/16035613",
    copyReplacements: [
      [/\s+and meets on the 2nd Thursday of every month from 10[-–]11\s*AM in the library['’]s conference room \(1st Floor\)/gi, ""],
      [/\s+y se reúne el segundo jueves de cada mes de 10 a 11 a\.\s*m\.\s+en la sala de conferencias de la biblioteca \(primer piso\)/gi, ""],
      [/\bin the library['’]s first-floor conference room\b/gi, "at Los Gatos Library"],
    ],
  },
  // The library links its skating provider but reverses the words in its
  // name. The provider identifies itself as Skate Open Spaces.
  // https://paloalto.bibliocommons.com/events/6a873b1560ccaf01c01fb300
  // https://skateopenspaces.com/
  // Evidence: docs/qa/2026-10-15-1107-fact-check.md.
  {
    date: "2026-10-24", url: "https://paloalto.bibliocommons.com/events/6a873b1560ccaf01c01fb300",
    copyReplacements: [[/\bopen skate spaces\b/gi, "Skate Open Spaces"]],
  },
  // The October 18 occurrence explicitly substitutes For Goodness Snakes for
  // regular storytime; its shared series prose is not that day's program.
  // https://sjpl.bibliocommons.com/events/69fb8818703c33630025ded4
  // Evidence: docs/qa/2026-10-15-0707-fact-check.md.
  {
    date: "2026-10-18", url: "https://sjpl.bibliocommons.com/events/69fb8818703c33630025ded4",
    facts: {
      blurb: "For Goodness Snakes replaces the regular storytime at King Library; recommended for ages 0–8 with caregivers.",
    },
  },
  // Tully's Day 3/4 titles and SJPL's published five-session curriculum agree;
  // this occurrence's copied English/Spanish body still names Day 1's topic.
  // Remove those conflicting fragments rather than inventing session copy.
  // https://www.sjpl.org/news/esl-workforce-development-workshops/
  // Evidence: docs/qa/2026-10-15-0507-fact-check.md and
  // docs/qa/2026-10-20-1807-fact-check.md.
  ...[
    ["2026-10-15", "6aa1bf97101eb7003f2ec8f0"],
    ["2026-10-22", "6aa1bf97101eb7003f2ec8f1"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
    aliasUrls: [`https://sjpl.bibliocommons.com/v2/events/${sourceId}`],
    copyReplacements: [
      [/\bWorkshop Topic:\s*Professional Introductions\s*&\s*My Skills\.?\s*/g, ""],
      [/\bTema del taller:\s*Presentaciones Profesionales y Mis Habilidades\.?\s*/g, ""],
    ],
  })),
  // The library gives no study for its population-wide hiring percentage.
  // Its body also says no registration while separate instructions request a
  // signup. Omit the statistic and disclose that conflict; retain the existing
  // conservative registration state rather than choosing an unsupported answer.
  // https://sjpl.bibliocommons.com/events/6a99d8351c197d11325d14f4
  // Evidence: docs/qa/2026-10-15-0507-fact-check.md.
  {
    date: "2026-10-15", url: "https://sjpl.bibliocommons.com/events/6a99d8351c197d11325d14f4",
    copyReplacements: [
      [/\bWhen it comes to job searching,\s*80% of the US population gets their job through someone they know[,.]\s*[Tt]his workshop\b/g, "This workshop"],
      [/\bNo Registration Required\./gi, "The library's description and signup instructions conflict; confirm registration requirements with the library."],
    ],
  },
  // SJPL's translated ticket-pickup sentence repeats "30 minutes" in Chinese.
  // English-only cleanup leaves the translated pickup clock's 30 attached
  // to the next sentence. ALL first-time participants must sign the waiver;
  // this is not a headcount. Protect the published fall series through its
  // final December 17 session, rather than repairing each Thursday anew.
  // https://sjpl.bibliocommons.com/events/6aa49028101eb7003f2f6dfd
  // Evidence: docs/qa/2026-10-15-0407-fact-check.md and
  // docs/qa/2026-10-21-1607-fact-check.md and
  // docs/qa/2026-10-26-1007-fact-check.md (October 29 source HTML).
  {
    dateFrom: "2026-10-15", dateThrough: "2026-12-17",
    matches: (event) => /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\//.test(event.url || "")
      && /^Line Dancing for Beginners\s*\/\s*Improvers$/i.test(event.title || "")
      && event.venue === "Calabazas Library"
      && /\btickets will be available(?: at the desk)? 30 minutes in advance\b/i.test(event.description || ""),
    copyReplacements: [[/(advance\.|ticket\.)\s+30\s+(First-time participants will need to sign a waiver form\b)/gi, "$1 $2"]],
  },
  // The library's Frida screening body misspells Kahlo's husband's surname.
  // Museo Frida Kahlo's biography identifies Diego Rivera; keep the screening
  // date and the rest of the organizer's description.
  // https://www.museofridakahlo.org.mx/frida/?lang=en
  // Evidence: docs/qa/2026-10-15-0407-fact-check.md.
  {
    date: "2026-10-17", url: "https://sjpl.bibliocommons.com/events/6a945850be148200298b2c83",
    copyReplacements: [[/\bDiego River\b/g, "Diego Rivera"]],
  },
  // Hillview's body has "12:30 - 1:00 am", but this occurrence's structured
  // start/end are 12:30–13:30 and its final 30 minutes are Stay & Play.
  // Correct only the storytime meridiem, leaving the event's clocks intact.
  // https://sjpl.bibliocommons.com/events/6aa86a287825b4006406d77d
  // Evidence: docs/qa/2026-10-16-2107-fact-check.md.
  {
    date: "2026-10-18", url: "https://sjpl.bibliocommons.com/events/6aa86a287825b4006406d77d",
    copyReplacements: [[/\bStorytime:?\s+12:30\s*[-–—]\s*1:00\s+am\b/gi, "Storytime: 12:30 - 1:00 pm"]],
  },
  // JAMsj's companion Skate Day & Halloween listing explicitly calls this
  // same exhibition's October 31 opening a free family-friendly event.
  // https://www.jamsj.org/upcoming-events
  // Evidence: docs/qa/2026-10-15-0307-fact-check.md.
  {
    date: "2026-10-31", url: "https://www.jamsj.org/upcoming-events/judi-oyama",
    facts: { kidFriendly: true },
  },
  // Montalvo's ticket pages identify these as student/family programs. Goblins
  // charges $20 adult / $14 child including fees; calendar JSON-LD omits offers.
  // The mariachi page does not support an outdoor stage.
  // Evidence: docs/qa/2026-10-15-0207-fact-check.md.
  {
    date: "2026-10-15", url: "https://my.montalvoarts.org/overview/3064",
    facts: { kidFriendly: true },
  },
  {
    date: "2026-10-22", url: "https://my.montalvoarts.org/overview/3065",
    facts: {
      kidFriendly: true,
      blurb: "Hear Mariachi Viajero and Angeles Danzantes perform traditional Mexican music and dance at Montalvo Arts Center.",
    },
  },
  {
    date: "2026-10-25", url: "https://my.montalvoarts.org/3257/3258",
    facts: { cost: "paid", kidFriendly: true },
  },
  // The SCU listing itself has the wrong Election Day. California's official
  // calendar confirms November 3, 2026; preserve the roundtable's October date.
  // https://www.sos.ca.gov/elections/upcoming-elections/general-election-november-3-2026
  {
    date: "2026-10-20",
    url: "https://events.scu.edu/arts-and-sciences/event/517594-whats-on-silicon-valleys-ballot-a-roundtable-on",
    copyReplacements: [[/elections will close on November 2nd/gi, "Election Day is November 3, 2026"]],
  },
  // This online fair's organizer is SCU's School of Education and Counseling,
  // not its RSS venue, UC Santa Cruz. The source explicitly uses a
  // VirtualLocation and OnlineEventAttendanceMode. Keep the publisher's city
  // as metadata; online events have no physical destination.
  // Evidence: docs/qa/2026-10-22-1807-fact-check.md.
  {
    date: "2026-10-28",
    url: "https://events.scu.edu/school-of-education-and-counseling/event/517795-uc-santa-cruz-grad-fair",
    facts: {
      venue: "Online", address: "", city: "santa-clara", virtual: true,
      blurb: "Meet Santa Clara University's School of Education and Counseling Psychology admissions team online.",
    },
  },
  // Stanford describes a giveaway/swap with incidental music, not a concert.
  // Evidence: docs/qa/2026-10-22-1807-fact-check.md.
  {
    date: "2026-10-23",
    url: "https://events.stanford.edu/event/big-swap-game-day-edition-177",
    facts: { category: "community" },
  },
  // SCU's full Event JSON-LD says this session is via Zoom, with registration
  // required for its link. Its online_type field is empty and RSS has no body.
  // https://events.scu.edu/leavey-school-of-business/event/509849-job-search-series-2-resume-linkedin-and-practical
  {
    date: "2026-10-15",
    url: "https://events.scu.edu/leavey-school-of-business/event/509849-job-search-series-2-resume-linkedin-and-practical",
    facts: {
      venue: "Online", address: "", virtual: true,
      description: "Online workshop on resumes, LinkedIn profiles, and practical networking. Register to receive the Zoom link.",
    },
  },
  // Stanford's occurrence page explicitly says Virtual Event, General Public,
  // and free with a personal or Stanford Zoom login. The sparse feed's campus
  // fallback must not turn this into a physical visit. Only published dates.
  // https://events.stanford.edu/event/drupallers-drop-in-web-help-q1-fy2027
  ...["2026-10-15", "2026-11-19", "2026-12-17"].map((date) => ({
    date, url: "https://events.stanford.edu/event/drupallers-drop-in-web-help-q1-fy2027",
    facts: {
      venue: "Online", address: "", virtual: true, cost: "free",
      description: "Free online drop-in help with Drupal, Stanford Sites, and other website questions. A personal or Stanford Zoom login is required.",
      blurb: "Join an online drop-in session for help with Drupal, Stanford Sites, and other website questions.",
    },
  })),
  // The Heritage Theatre page supports Steve Perry solo work, not touring
  // with Journey's original lineup. Evidence: docs/qa/2026-10-14-late-fact-check.md.
  {
    id: "heritage-1e9b8b39407d8f09", date: "2027-02-19",
    url: "https://www.heritagetheatre.org/events/journey-usa-the-hits-of-journey",
    facts: { blurb: "Watch Journey USA perform the hits of Journey at Heritage Theatre." },
  },
  // Merry-Achi Christmas is the show; VBO names José Hernández and Sol de
  // México as the performers. Match the dated show even when VBO rotates its
  // session URL. Evidence: docs/qa/2026-10-14-late-fact-check.md.
  ...["2026-11-27", "2026-11-28"].map((date) => ({
    date, title: /^Hammer Presents Merry-Achi Christmas 2026$/i,
    venue: /^Hammer Theatre Center$/i,
    facts: {
      description: "José Hernández and Mariachi Sol de México present a holiday mariachi concert at Hammer Theatre.",
      blurb: "Hear José Hernández and Mariachi Sol de México perform Merry-Achi Christmas at Hammer Theatre.",
    },
  })),
  // Ticketmaster's structured lineup spells these artists correctly while its
  // Event Info text contains typos. Correct only those strings so future
  // lineup changes remain intact. Evidence: docs/qa/2026-10-14-evening-fact-check.md.
  {
    id: "tm-G5vYZ_35P5NtU", date: "2026-11-20",
    url: "https://www.ticketmaster.com/who-want-the-smoke-san-jose-california-11-20-2026/event/1C006522E52E3A76",
    copyReplacements: [
      [/\bShorline Mafia\b/g, "Shoreline Mafia"],
      [/\bKamayiah\b/g, "Kamaiyah"],
      [/\bLinup\b/g, "Lineup"],
    ],
  },
  // These newsletters used the non-resolving stanfordlive.stanford.edu host.
  // Stanford's event pages also support a recital (no Grammy claim) and
  // Duane Forrest's acoustic reggae performance (not a staged biography).
  // Evidence: docs/qa/2026-10-11-fact-check.md.
  {
    date: "2026-10-11",
    title: /^Kronos Quartet with Mahsa and Marjan Vahdat/i, venue: /Bing Concert Hall/i,
    facts: { url: "https://events.stanford.edu/event/kronos-quartet-with-mahsa-and-marjan-vahdat-placeless" },
  },
  {
    date: "2026-11-11",
    url: "https://live.stanford.edu/events/26-27season/studio/bob-marley/",
    title: /^Bob Marley: How Reggae Changed the World/i, venue: /The Studio/i,
    facts: {
      url: "https://live.stanford.edu/events/26-27season/studio/bob-marley/",
      category: "music",
      description: "Duane Forrest performs acoustic versions of songs by Bob Marley and other reggae artists at The Studio.",
      blurb: "Hear Duane Forrest perform acoustic versions of songs by Bob Marley and other reggae artists.",
    },
  },
  {
    date: "2026-11-18",
    title: /^Rachel Willis-S[øo]rensen Vocal Recital/i, venue: /Bing Concert Hall/i,
    facts: {
      url: "https://live.stanford.edu/events/26-27season/bing-concert-hall/rachel-willis-sorensen/",
      description: "Soprano Rachel Willis-Sørensen performs a vocal recital with pianist Tamar Sanikidze.",
      blurb: "Hear soprano Rachel Willis-Sørensen in a vocal recital with pianist Tamar Sanikidze.",
    },
  },
  // Levi's dated event guide lists gates at 5:30 PM, not the newsletter's
  // 11:25 AM. Keep showtime distinct from entry and parking clocks.
  // Evidence: docs/qa/2026-10-11-fact-check.md.
  {
    date: "2026-10-11",
    title: /^Bruno Mars\b/i, venue: /Levi['’]?s Stadium/i,
    facts: {
      time: "7:00 PM", category: "music", cost: "paid",
      url: "https://levisstadium.com/event/bruno-mars-the-romantic-tour-october-11th/",
      description: "Bruno Mars performs The Romantic Tour at Levi's Stadium. The show starts at 7 PM; stadium gates open at 5:30 PM and parking opens at 4 PM.",
    },
  },
  // Stanford Live's October 10 page and AXS agree: parking 4 PM, gates 5 PM,
  // show 6 PM. Older newsletters had 7 PM or no time, and venue-page backfill
  // supplied an unrelated 4 PM time. Canonical facts let existing dedupe
  // collapse both rows. Evidence: docs/qa/2026-10-10-fact-check.md.
  {
    date: "2026-10-10",
    title: /^Taking Back Sunday\b/i, venue: /Frost Amphitheat(?:er|re)/i,
    facts: {
      title: "Taking Back Sunday with Thrice and Saves the Day",
      time: "6:00 PM", endTime: null,
      address: "351 Lasuen Street, Stanford, CA 94305",
      url: "https://live.stanford.edu/events/26-frost/taking-back-sunday/",
      cost: "paid",
      description: "Taking Back Sunday performs with Thrice and Saves the Day at Frost Amphitheater. The show starts at 6 PM; gates open at 5 PM and parking opens at 4 PM.",
      blurb: "Hear Taking Back Sunday with Thrice and Saves the Day at Frost Amphitheater.",
    },
  },
  {
    date: "2026-10-18",
    title: /^MUNA\b/i, venue: /Frost Amphitheat(?:er|re)/i,
    facts: {
      title: "MUNA Gets So Hot Tour",
      time: "7:00 PM", endTime: null, category: "music",
      address: "351 Lasuen Street, Stanford, CA 94305",
      url: "https://live.stanford.edu/events/26-frost/muna/",
      cost: "paid",
      description: "MUNA performs its Gets So Hot Tour with hemlocke springs at Frost Amphitheater. The show starts at 7 PM; gates open at 6 PM and parking opens at 5 PM.",
      blurb: "Hear MUNA on its Gets So Hot Tour with hemlocke springs at Frost Amphitheater.",
    },
  },
  // SVP's October 6 CORRECTION newsletter supersedes its October 5 notice:
  // the Senior Center chat is Friday, October 9, not Saturday, October 10.
  // Both first-party extraction records remain in inbound-events.json.
  // Evidence and record IDs: docs/qa/2026-10-09-fact-check.md.
  {
    id: "inbound-5f25d927141e66bc", date: "2026-10-10",
    title: /^Public Power Week Fireside Chat at Senior Center$/i,
    venue: /Santa Clara Senior Center/i,
    facts: { date: "2026-10-09", displayDate: "Fri, Oct 9", time: "10:00 AM", endTime: "12:00 PM" },
  },
  // October 4 fact-check: exact first-party dates/links, recorded in
  // docs/qa/2026-10-04-fact-check.md. Correct occurrence dates before filtering.
  {
    date: "2026-10-04",
    url: "https://www.campbellca.gov/597/Community-Garage-Sale",
    aliasUrls: ["http://www.campbellca.gov/597/Community-Garage-Sale"],
    facts: {
      date: "2026-10-03", displayDate: "Sat, Oct 3",
      time: "8:00 AM", endTime: "4:00 PM",
      url: "https://www.campbellca.gov/597/Community-Garage-Sale",
    },
  },
  {
    id: "inbound-780560b96929bcbc", date: "2026-10-17",
    title: /all greg['’]?s kids come home/i, venue: /the studio/i,
    facts: {
      title: "All Greg's Kids Come Home - Staged Reading",
      url: "https://live.stanford.edu/events/26-27season/studio/chinaka-hodge/",
      category: "arts", kidFriendly: false,
      description: "A staged reading of Chinaka Hodge's play All Greg's Kids Come Home, exploring the hidden systems behind a hyper-capable family's public facade.",
    },
  },
  {
    id: "inbound-34f99c30f80b4fe9", date: "2026-10-03",
    title: /preparing your fruit trees for winter/i, venue: /saratoga heritage orchard/i,
    facts: {
      url: "https://www.saratoga.ca.us/CivicSend/ViewMessage/message/301201",
      cost: "free", registration: "required",
    },
  },
  {
    id: "inbound-1fb1fb86591a2a03", date: "2026-10-03",
    title: /downtown palo alto farmers['’]? market/i, venue: /gilman street/i,
    facts: { url: "https://www.pafarmersmarket.org/home" },
  },
  // October 3 fact-check: dated first-party performance pages, documented in
  // docs/qa/2026-10-03-fact-check.md. Never use lobby/doors times as showtimes.
  {
    id: "inbound-f4a4b72dea6f0e4f", date: "2027-02-24",
    title: /rihab chaieb/i, venue: /bing concert hall/i,
    facts: {
      url: "https://live.stanford.edu/events/26-27season/bing-concert-hall/rihab-chaieb-nomad-the-eternal-wanderer/",
      description: "Mezzo-soprano Rihab Chaieb performs a vocal recital with pianist Ammiel Bushakevitz, featuring songs about wandering and belonging.",
      blurb: "Hear mezzo-soprano Rihab Chaieb in a vocal recital with pianist Ammiel Bushakevitz.",
    },
  },
  {
    id: "inbound-1587f50df9527856", date: "2027-03-10",
    title: /jaemin han cello recital/i, venue: /bing concert hall/i,
    facts: {
      time: "7:30 PM",
      url: "https://live.stanford.edu/events/26-27season/bing-concert-hall/jaemin-han-cello-recital/",
    },
  },
  {
    id: "inbound-dc74287346b53e2c", date: "2027-02-07",
    title: /^taimane$/i, venue: /heritage theatre/i,
    facts: { time: "7:30 PM", url: "https://www.heritagetheatre.org/2026-2027-season-of-shows" },
  },
  {
    id: "inbound-7fcc5c68692b8e3f", date: "2027-02-04",
    title: /renée qin and ania filochow/i, venue: /the studio/i,
    facts: { title: "Renée Qin and Ania Filochowska: The World We Speak Into Being" },
  },
  {
    id: "inbound-6ae1a3f06f4a40b4", date: "2027-03-03",
    title: /300 paintings.*sam kissajukian/i, venue: /the studio/i,
    facts: {
      url: "https://live.stanford.edu/events/26-27season/studio/300-paintings/",
      description: "Sam Kissajukian performs a comedy show drawing on his experience creating 300 paintings and exploring art, mental health, and creativity.",
      blurb: "Watch Sam Kissajukian perform 300 Paintings, a show about art, mental health, and creativity.",
    },
  },
  {
    id: "inbound-ea1ef0ed5c36abf4", date: "2027-02-21",
    title: /^international guitar night$/i, venue: /bing concert hall/i,
    facts: { url: "https://live.stanford.edu/events/26-27season/bing-concert-hall/international-guitar-night/" },
  },
  // These November/December newsletter timestamps used July's -07 offset,
  // which would render 6 PM. The city/performer calendars confirm 7 PM starts.
  {
    date: "2026-11-17", title: /toast.*best of bread/i, venue: /heritage theatre/i,
    facts: { time: "7:00 PM" },
  },
  {
    date: "2026-11-19", title: /world ballet company.*swan lake/i, venue: /heritage theatre/i,
    facts: { time: "7:00 PM" },
  },
  {
    date: "2026-11-20", title: /harriet.*trying to get the feeling again/i, venue: /heritage theatre/i,
    facts: { time: "7:00 PM" },
  },
  {
    date: "2026-12-16", title: /world ballet company.*nutcracker/i, venue: /heritage theatre/i,
    facts: { time: "7:00 PM" },
  },
  // October 2 URL follow-up: the organizer's own product page confirms the
  // dated session and says Sold out. Do not promote it as bookable.
  // Evidence: docs/qa/2026-10-02-growth-followup.md.
  {
    id: "inbound-b451c136762c2e2c",
    date: "2026-10-17",
    url: "https://bagi.org/products/diy-alebrije-dia-de-los-muertos-edition",
    facts: { endTime: "3:30 PM", registration: REGISTRATION_FULL },
  },
  {
    id: "sjpl-6a7bc1324cb69d003e203e28",
    date: "2026-09-06",
    url: "https://sjpl.bibliocommons.com/events/6a7bc1324cb69d003e203e28",
    facts: {
      time: "2:00 PM",
      endTime: "3:30 PM",
      sourceAudiences: ["Kids, ages 5-10"],
      audienceAge: "kids",
      kidFriendly: true,
      description: `Build and race two balloon-powered cars in Berryessa Library’s Community Room. Recommended for elementary students ages 5–10. ${DERBY_ATTENDANCE}`,
      blurb: "Build and race balloon-powered cars, recommended for ages 5–10.",
      attendanceNote: DERBY_ATTENDANCE,
      attendanceStatus: "needs-confirmation",
    },
  },
  {
    id: "cbdd438d7fbe",
    date: "2026-09-06",
    url: "https://losgatosca.libcal.com/event/17096186",
    facts: {
      sourceAudiences: ["Adults"],
      audienceAge: "adult",
      kidFriendly: false,
      description: "Training for adults in the Los Gatos Library Lobby, 4–5 PM, on recognizing an opioid overdose and using Narcan.",
      blurb: "Adults can learn to recognize an opioid overdose and use Narcan in the library lobby.",
    },
  },
  {
    id: "sanjosetheaters-eb92ddeb3f824327",
    date: "2026-09-05",
    title: /grupo duelo/i,
    venue: /san jose civic/i,
    facts: {
      description: "Óscar Iván Treviño and Grupo Duelo bring their norteño music to San Jose Civic on the Gravedad Tour 2026.",
      blurb: "Hear Óscar Iván Treviño and Grupo Duelo perform norteño music at San Jose Civic.",
    },
  },
  {
    id: "tm-Z7r9jZ1A7x78x",
    date: "2026-09-05",
    title: /lost 80['’]?s live/i,
    venue: /mountain winery/i,
    facts: {
      description: "Lost 80s Live features original vocalists or members, including Oingo Boingo Former Members, The Vapors, China Crisis, Big Country, B-Movie, Katrina, Icicle Works and Musical Youth. Show at 6 PM; doors at 4 PM.",
      blurb: "Hear Oingo Boingo Former Members, The Vapors, China Crisis and more at Lost 80s Live.",
      url: "https://lost80slive.com/event/mwc09052026/",
      time: "6:00 PM",
    },
  },
  {
    id: "sjpl-6a5280ebe564853d00fd6ea4",
    date: "2026-09-05",
    title: /pawsitive learning with town cats/i,
    venue: /vineland library/i,
    facts: {
      description: "Learn responsible cat care with Town Cats at Vineland Library, 2–3 PM. Recommended for ages 5+. Space is limited; tickets are available at the Information Desk starting at 1 PM.",
      blurb: "Learn cat care with Town Cats; pick up a ticket at Vineland Library’s Information Desk starting at 1 PM.",
      attendanceNote: "Recommended for ages 5+. Limited space; in-person ticket pickup at the Information Desk starts at 1 PM for the 2–3 PM program.",
    },
  },
  // 2026-09-08 issue QA. Broadway San Jose's own show page lists Family Night
  // on Broadway as Wednesday, September 9 only, with the free 6:00–7:15 PM
  // pre-show activities open to that performance's ticketholders. The inbound
  // City Newsletter record carried that sentence on the Sept 8 opening night,
  // so the blurb (and the issue's field guide) promised families a pre-show
  // that does not happen until the following evening.
  // Evidence: docs/qa/2026-09-08-newsletter.md
  {
    id: "inbound-b60351612d66d165",
    date: "2026-09-08",
    facts: {
      description: "Disney's first North American touring production of the beloved musical in over 25 years, featuring members of the original creative team. Broadway San Jose's run at the San Jose Center for the Performing Arts opens Tuesday, September 8 at 7:30 PM and plays through Sunday, September 13.",
      blurb: "See Disney's touring Beauty and the Beast open its San Jose run at the Center for the Performing Arts.",
    },
  },
  // The same fact belongs on the night it actually happens. Sept 9 is both the
  // closed-caption performance and Family Night on Broadway.
  {
    id: "tm-G5vYZ_1p2R16z",
    date: "2026-09-09",
    facts: {
      description: "Disney's touring Beauty and the Beast at the San Jose Center for the Performing Arts. This is Family Night on Broadway: all ticketholders for the 7:30 PM performance are invited to free pre-show activities from 6:00 PM to 7:15 PM. The performance is closed captioned.",
      blurb: "Catch Beauty and the Beast on Family Night, with free pre-show activities from 6 PM and closed captions during the show.",
    },
  },
  // Mountain View's Community Preservation Lab is an appointment service, not a
  // walk-in: the library's own page requires registration for a 90-minute
  // scanning slot and caps it at one per household per week. The libcal ingest
  // path set no registration state, so the record read as a walk-up and was
  // promoted to the Sept 8 afternoon plan card telling readers to just bring
  // their photos. "appointment-only" restores the existing advance-registration
  // gate, which keeps it in the listings with an "Appointment required" tag.
  //
  // registrationFromLibCal (eventFilters.mjs) now derives that state at ingest
  // for every LibCal event, so this `registration` is a floor rather than the
  // mechanism. The other two facts are NOT redundant: libraryEventDetails
  // builds attendanceNote only from ticket/first-come/limited-space phrasing,
  // which this description does not use, and the blurb is not derivable at all.
  {
    id: "d610aa488850",
    date: "2026-09-08",
    url: "https://mountainview.libcal.com/event/17319757",
    facts: {
      registration: REGISTRATION_APPOINTMENT,
      attendanceNote: "Registration is required. Sessions are 90 minutes and limited to one per household per week; September 8 slots are 1:00–2:30 PM and 3:00–4:30 PM in the History Center.",
      blurb: "Book a 90-minute appointment to digitize your own photos and documents with staff help at the History Center.",
    },
  },
  // Craft Tuesdays & Thursdays runs a different craft each session, and the
  // library lists the whole schedule on every occurrence. The cached blurb
  // summarised the series, so it advertised crafts that had already happened
  // (cactus characters Sept 1, beaded insects Sept 3) instead of the one a
  // reader would actually make that afternoon.
  {
    id: "sjpl-6a945a62be148200298b2cfb",
    date: "2026-09-08",
    facts: {
      blurb: "Make washi tape bookmarks at this week's drop-in craft session; supplies are limited, first come, first served.",
    },
  },
  {
    id: "sjpl-6a945a62be148200298b2cfc",
    date: "2026-09-10",
    facts: {
      blurb: "Make bug headbands at this week's drop-in craft session; supplies are limited, first come, first served.",
    },
  },
  // October 2 growth review: the SJMA browser snapshot put calendar dates in
  // `time` and defaulted every listing to paid. The direct adapter remains
  // retired; these bounded corrections use the museum's published detail
  // pages and survive carried-forward snapshots. Never roll them into a new
  // year or infer general admission from an event title.
  {
    id: "0fd141a7f257",
    date: "2026-10-02",
    url: "https://sjmusart.org/event/first-friday-new-ballet-season-preview",
    facts: {
      time: "6:00 PM", endTime: "9:00 PM", cost: "free",
      description: "Free evening galleries and a preview of New Ballet's 10th anniversary season. The ballet preview is in the Charlotte Wendel Education Center; doors open at 7:25 PM and seating is first come, first served.",
      blurb: "Enjoy free evening galleries and a preview of New Ballet's 10th anniversary season.",
      attendanceNote: "Advance registration speeds check-in. Ballet-preview doors open at 7:25 PM; seating is limited, first come, first served.",
    },
  },
  {
    id: "703687c2511a",
    date: "2026-10-24",
    url: "https://sjmusart.org/programs-at-sjma/community-days/dia-de-los-muertos",
    aliasUrls: ["https://sjmusart.org/community-day-dia-de-los-muertos"],
    facts: {
      url: "https://sjmusart.org/programs-at-sjma/community-days/dia-de-los-muertos",
      time: "11:00 AM", endTime: "4:00 PM", cost: "free",
      kidFriendly: true, audienceAge: "all",
      description: "Celebrate Día de los Muertos with live entertainment, cultural demonstrations, and art activities at San Jose Museum of Art. Museum admission is free all day and activities end at 4 PM.",
      blurb: "Celebrate Día de los Muertos with free art activities, live entertainment, and cultural demonstrations.",
      attendanceNote: "Advance registration is recommended; walk-ins are welcome. Sugar skull decorating requires a separate ticket available at the museum that day.",
    },
  },
  {
    id: "91accca935ec",
    date: "2026-10-27",
    url: "https://sjmusart.org/event/sjsu-art-galleries-tuesday-night-lecture-lua-vollaard",
    facts: {
      time: "2:00 PM", endTime: "3:00 PM", cost: "free",
      venue: "San Jose State University, ART 133: Art Lecture Hall",
      address: "One Washington Square, San Jose, CA 95192",
      // The old fallback photo depicts SJMA, not this offsite lecture hall.
      photoRef: null,
      description: "Lua Vollaard discusses artists' responses to technological development. This free lecture takes place offsite at San Jose State University's ART 133: Art Lecture Hall.",
      blurb: "Hear Lua Vollaard discuss art and technological development at SJSU's ART 133 lecture hall.",
    },
  },
  ...[
    { id: "e9db5308794a", date: "2026-10-28", url: "https://sjmusart.org/walk-naturalist-october-2026" },
    { id: "fe4a7a23e4bd", date: "2026-11-18", url: "https://sjmusart.org/walk-naturalist-november-2026" },
  ].map((occurrence) => ({
    ...occurrence,
    aliasUrls: ["https://sjmusart.org/programs-at-sjma/walk-with-a-naturalist"],
    facts: {
      url: "https://sjmusart.org/programs-at-sjma/walk-with-a-naturalist",
      time: "12:30 PM", endTime: "1:30 PM", cost: "paid",
      costNote: "Tour included with museum admission",
      kidFriendly: true, audienceAge: "all",
      description: "Explore \"a small ocean swallowed\" with Shelby Hendricks through art and science. Meet in the first-floor lobby. The tour is included with museum admission and is open to all ages.",
      blurb: "Explore \"a small ocean swallowed\" through art and science with Shelby Hendricks.",
      attendanceNote: "Advance registration is recommended. Walk-ins are welcome as space permits; each tour is limited to 20 participants.",
    },
  })),
  {
    id: "8f7697d5027c",
    date: "2026-11-06",
    url: "https://sjmusart.org/event/first-fridays-november-2026",
    facts: {
      time: "6:00 PM", endTime: "9:00 PM", cost: "free",
      description: "Enjoy free evening galleries and entertainment at San Jose Museum of Art's First Fridays.",
      blurb: "Enjoy free evening galleries and entertainment at San Jose Museum of Art.",
      attendanceNote: "Register in advance for faster check-in.",
    },
  },
  {
    id: "a322ab0c474f",
    date: "2026-12-04",
    url: "https://sjmusart.org/event/first-fridays-celebrate-holidays-pride",
    aliasUrls: ["https://sjmusart.org/event/first-fridays-december-2026"],
    facts: {
      title: "First Fridays: Celebrate the Holidays with Pride",
      url: "https://sjmusart.org/event/first-fridays-celebrate-holidays-pride",
      time: "6:00 PM", endTime: "9:00 PM", cost: "free",
      description: "Celebrate San Jose's LGBTQIA+ community with live music, storytelling, and drag performances. Museum admission is free after 6 PM.",
      blurb: "Celebrate the holidays with live music, storytelling, and drag performances; admission is free after 6 PM.",
      attendanceNote: "Register in advance for faster check-in.",
    },
  },
];

export function applyVerifiedEventFacts(event) {
  // These league adapters used fixed durations to invent exact finish times.
  // Strip those values from retained/cached rows as well as fresh ingestion;
  // an endTime is a published clock, never a predicted game duration.
  // Evidence: docs/qa/2026-11-05-1307z-fact-check.md.
  const leagueScheduleGame = (event?.source === "G League"
      && /^sc-warriors-/.test(event.id || "")
      && /^https:\/\/santacruz\.gleague\.nba\.com\/schedule\/?$/.test(event.url || ""))
    || (event?.source === "NHL" && /^sharks-/.test(event.id || "")
      && /^https:\/\/www\.nhl\.com\/sharks\/schedule\/?$/.test(event.url || ""));
  if (leagueScheduleGame && event.endTime != null) event = { ...event, endTime: null };
  // These exact SCCLD occurrences allow teen spectators while player seats
  // are full. A "full" registration badge would wrongly close spectator
  // attendance. Protect carried/cached blurbs, and stop if the source changes
  // its capacity terms; this list never creates or infers another occurrence.
  // Evidence: docs/qa/2026-11-03-0507z-fact-check.md.
  const teenGameId = /^https:\/\/sccl\.bibliocommons\.com\/(?:v2\/)?events\/([a-f0-9]+)\/?(?:[?#].*)?$/.exec(event?.url || "")?.[1];
  if (event?.date && LOS_ALTOS_TEEN_DND_DATES[teenGameId] === event.date
      && /\bgame is full\b/i.test(event.description || "")
      && /\bteen drop[ -]?ins to watch the game are welcome\b/i.test(event.description || "")) {
    const spectatorNote = "Player seats are full. Teen spectators are welcome; check in at the adult reference desk.";
    event = {
      ...event,
      blurb: "Watch the teen Dungeons and Dragons game at Los Altos Library; player seats are currently full.",
      attendanceNote: (event.attendanceNote || "").includes(spectatorNote) ? event.attendanceNote
        : [event.attendanceNote, spectatorNote].filter(Boolean).join(" "),
    };
  }
  // These dated Calabazas occurrences give two incompatible print limits.
  // Preserve the source text and disclose the ambiguity without selecting a
  // limit. Stop adding the note when either conflicting clause is corrected.
  // Evidence: docs/qa/2026-10-30-2007-fact-check.md and
  // docs/qa/2026-11-07-2207z-fact-check.md (fresh exact-ID responses).
  const printLimitId = /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/([a-f0-9]+)\/?(?:[?#].*)?$/.exec(event?.url || "")?.[1];
  if (event?.date && CALABAZAS_PRINT_LIMIT_DATES[printLimitId] === event.date
      && /\bDesigns must print in 1 hour 45 minutes\b/i.test(event.description || "")
      && /\bhave a print time of under 45 minutes\b/i.test(event.description || "")) {
    const printLimitNote = "The library lists conflicting print-time limits (45 minutes and 1 hour 45 minutes). Confirm your design's limit with Calabazas Library at cz.sjpl@sjlibrary.org.";
    if (!(event.attendanceNote || "").includes(printLimitNote)) {
      event = { ...event, attendanceNote: [event.attendanceNote, printLimitNote].filter(Boolean).join(" ") };
    }
  }
  // The sparse SJSU RSS body omits the card needed to use this public lab.
  // The library's access guide sets this condition for the program, rather
  // than individual dates. Apply it to existing occurrences of the exact
  // program URL so a new RSS date cannot lose it; never create occurrences.
  // A library card is not an event reservation or a virtual access condition.
  // https://events.sjsu.edu/event/open-lab-ai-center
  // https://sjlibrary.org/aicenter
  // Evidence: docs/qa/2026-10-31-1107-fact-check.md.
  if (!event?.virtual
      && /^https:\/\/events\.sjsu\.edu\/event\/open-lab-ai-center\/?$/.test(event?.url || "")) {
    const accessNote = "Bring a valid SJSU Tower Card or SJPL library card to use the AI Center.";
    if (!(event.attendanceNote || "").includes(accessNote)) {
      event = { ...event, attendanceNote: [event.attendanceNote, accessNote].filter(Boolean).join(" ") };
    }
  }
  // The operator's Directions page confirms Picchetti at this exact address.
  // Repair the organizer's missing c in names and cached prose, without
  // inferring any occurrence, admission, or availability facts from the venue.
  // https://www.picchetti.com/Directions
  // Evidence: docs/qa/2026-10-26-0307-fact-check.md.
  if (!event?.virtual && event?.city === "cupertino"
      && /^Pic{1,2}hetti Ranch & Winery$/i.test(event?.venue || "")
      && /^13100 Montebello (?:Road|Rd)\.?, Cupertino(?:,? CA\.? ?(?:95014)?)?$/i.test(event?.address || "")) {
    const names = {};
    for (const field of ["title", "venue", "description", "blurb", "attendanceNote"]) {
      if (typeof event[field] !== "string") continue;
      const corrected = event[field].replace(/\bPichetti\b/gi, "Picchetti");
      if (corrected !== event[field]) names[field] = corrected;
    }
    if (Object.keys(names).length) event = { ...event, ...names };
  }
  // The operator brands this Sunnyvale pub "Fibbar MaGees", without an
  // apostrophe. Copy editing must not respell the proper name. Require its
  // actual street address and venue identity before repairing prose; a name
  // mentioned at another location is not enough. This does not confirm an
  // organizer's occurrence, clocks, admission, or registration state.
  // https://fibbars.com/
  // Evidence: docs/qa/2026-10-25-1207-fact-check.md.
  if (!event?.virtual && event?.city === "sunnyvale"
      && /^Fibbar Magee['’]?s$/i.test(event?.venue || "")
      && /^156 S\.? Murphy Ave(?:nue)?\.?, Sunnyvale(?:, CA(?: 94086)?)?$/i.test(event?.address || "")) {
    const names = {};
    for (const field of ["title", "venue", "description", "blurb", "attendanceNote"]) {
      if (typeof event[field] !== "string") continue;
      const corrected = event[field].replace(/\bFibbar Magee['’]?s\b/gi, "Fibbar MaGees");
      if (corrected !== event[field]) names[field] = corrected;
    }
    if (Object.keys(names).length) event = { ...event, ...names };
  }
  // Older LibCal snapshots inherited the civic center address from our config.
  // Repair only that known error at the library itself; off-site programs,
  // online events and the civic center's own events keep their locations.
  // https://www.losgatosca.gov/2828/Los-Gatos-Public-Library
  // Evidence: docs/qa/2026-10-21-1007-fact-check.md.
  if (!event?.virtual
      && (!event?.city || event.city === "los-gatos")
      && /^https:\/\/losgatosca\.libcal\.com\/event\//i.test(event?.url || "")
      && /^Los Gatos Library$/i.test(event?.venue || "")
      && /^110 E\.? (?:Main St(?:reet)?\.?), Los Gatos(?:, CA(?: 95030)?)?$/i.test(event?.address || "")) {
    event = { ...event, address: "100 Villa Ave, Los Gatos, CA 95030" };
  }
  // NUMU's exhibition pages give 106 E. Main Street as the visitor location;
  // newsletter intake instead picked up its mailing box. Limit this repair
  // to that museum, its own exhibition URLs, and the known mailing address.
  // It must survive the daily date change of an ongoing exhibition.
  // https://www.numulosgatos.org/exhibitions-2/belle-yang
  // Evidence: docs/qa/2026-10-16-0307-fact-check.md.
  if (!event?.virtual
      && /^https:\/\/(?:www\.)?numulosgatos\.org\/exhibitions-2\//i.test(event?.url || "")
      && /^(?:NUMU\s+)?New Museum Los Gatos(?:\s+\(NUMU\))?$/i.test(event?.venue || "")
      && /\bp\.?\s*o\.?\s+box\s+1904\b/i.test(event?.address || "")) {
    event = { ...event, address: "106 E. Main Street, Los Gatos, CA 95030" };
  }
  const correction = CORRECTIONS.find((c) => {
    // A range is inclusive and must have both bounds. It can protect a
    // verified run or narrowly matched source conflict, never create dates.
    const matchesDate = c.date ? event?.date === c.date
      : Boolean(c.dateFrom && c.dateThrough && event?.date >= c.dateFrom && event?.date <= c.dateThrough);
    return matchesDate && (
      (c.id && event.id === c.id) || (c.url && event.url === c.url)
        || c.aliasUrls?.includes(event.url)
        || (c.title?.test(event.title || "") && c.venue?.test(event.venue || ""))
        || c.matches?.(event)
    );
  });
  if (!correction) return event;
  const corrected = { ...event, ...correction.facts };
  // A verified signup requirement cannot reopen a session whose current
  // provider metadata says full/closed or replace an appointment gate. A
  // full-seat correction likewise cannot reopen an explicitly closed window.
  if ((correction.facts?.registration === REGISTRATION_REQUIRED
      && [REGISTRATION_FULL, REGISTRATION_CLOSED, REGISTRATION_APPOINTMENT].includes(event.registration))
      || (correction.facts?.registration === REGISTRATION_FULL && event.registration === REGISTRATION_CLOSED)) {
    corrected.registration = event.registration;
  }
  // Entry conditions supplement current booking/availability notices; never
  // replace a later sold-out, closed or organizer-confirmation message.
  if (correction.appendAttendanceNote
      && !(corrected.attendanceNote || "").includes(correction.appendAttendanceNote)) {
    corrected.attendanceNote = [corrected.attendanceNote, correction.appendAttendanceNote].filter(Boolean).join(" ");
  }
  // Attendance notes also carry source copy and need the same verified fixes.
  for (const field of ["description", "blurb", "attendanceNote"]) {
    if (typeof corrected[field] !== "string") continue;
    for (const [pattern, replacement] of correction.copyReplacements ?? []) {
      corrected[field] = corrected[field].replace(pattern, replacement);
    }
  }
  return corrected;
}

// ---------------------------------------------------------------------------
// Reference matching: is this copy talking about this event at all?
// ---------------------------------------------------------------------------

function comparable(value) {
  return String(value || "").toLowerCase().replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Words that name a KIND of place rather than a specific one. Trimming them
// off the end leaves the part a reader actually says out loud: "Seven Trees
// Library" -> "seven trees". Kept to a suffix trim so the proper-name phrase
// stays contiguous ("San Jose Civic" is not a generic anything).
const GENERIC_VENUE_WORDS = new Set([
  "library", "branch", "center", "centre", "hall", "room", "rooms", "theater",
  "theatre", "museum", "school", "church", "gallery", "lounge", "campus",
  "auditorium", "public", "community", "regional", "main", "the",
]);

function venueCore(venue) {
  const tokens = comparable(venue).split(" ").filter(Boolean);
  while (tokens.length > 1 && GENERIC_VENUE_WORDS.has(tokens.at(-1))) tokens.pop();
  return tokens.join(" ");
}

const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "our", "their", "this", "that", "free",
  "annual", "weekly", "monthly", "special", "join", "come",
]);

function singular(token) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

// The one word a reader would keep if they dropped the registration title:
// "Playdates for Children and Their Caregivers" -> "playdate".
function titleHeadNoun(rawTitle) {
  const body = rawTitle.match(/^[^:]{1,32}:\s+(.+)$/)?.[1] ?? rawTitle;
  for (const token of comparable(body).split(" ")) {
    if (token.length >= 5 && !TITLE_STOPWORDS.has(token)) return singular(token);
  }
  return "";
}

export function copyMentionsEvent(text, event) {
  const rawTitle = String(event?.rawTitle || event?.title || "").split(/\s[–—-]\s/)[0];
  const title = comparable(rawTitle);
  const copy = comparable(text);
  if (title.length >= 5 && copy.includes(title)) return true;
  // Intros often omit a category prefix: "the balloon car derby" still
  // refers to "STEM: Balloon Car Derby" and needs the same attendance guard.
  const withoutPrefix = comparable(rawTitle.match(/^[^:]{1,32}:\s+(.+)$/)?.[1]);
  if (withoutPrefix.length >= 10 && withoutPrefix.includes(" ") && copy.includes(withoutPrefix)) return true;

  // A reader-facing reference names the place and the kind of thing rather
  // than the registration title: the 2026-09-09 "Also on the calendar" intro
  // said "the Seven Trees playdate" for "Playdates for Children and Their
  // Caregivers", so no title path matched and the whole unsupported() guard
  // skipped the event. Require BOTH halves — a venue alone sweeps in every
  // event at that address, a head noun alone every playdate in the county.
  const core = venueCore(event?.venue);
  const head = titleHeadNoun(rawTitle);
  if (core.length < 6 || head.length < 5 || !copy.includes(core)) return false;
  return copy.split(" ").some((token) => singular(token) === head);
}

// ---------------------------------------------------------------------------
// Source-grounded fact checks
// ---------------------------------------------------------------------------

// Everything the SOURCE says, never the model's earlier blurb. An empty or
// truncated description is not permission to invent an age gate or an act.
function sourceText(event) {
  return [
    event?.rawTitle,
    event?.title,
    event?.description,
    event?.attendanceNote,
    ...(Array.isArray(event?.sourceAudiences) ? event.sourceAudiences : []),
  ].filter(Boolean).join(" ");
}

function splitSentences(text) {
  const parts = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?]+(?:\s+|$)/g)) {
    parts.push({ start, end: m.index + m[0].length });
    start = m.index + m[0].length;
  }
  if (start < text.length) parts.push({ start, end: text.length });
  return parts;
}

// Attribute a claim to this event only when the sentence carrying it refers to
// the event. The 2026-09-09 intro packed three events into one sentence, so
// validating every claim in a string against every event it mentions would
// blank copy that was right about a different one. Single-sentence copy (a
// card blurb) is about its own event by construction.
function claimAppliesToEvent(copy, index, event) {
  const sentences = splitSentences(copy);
  if (sentences.length < 2) return true;
  const sentence = sentences.find((s) => index >= s.start && index < s.end);
  return !sentence || copyMentionsEvent(copy.slice(sentence.start, sentence.end), event);
}

const COURSE_LEVEL_WORDS = {
  zero: 0, cero: 0, one: 1, uno: 1, two: 2, dos: 2, three: 3, tres: 3,
  four: 4, cuatro: 4, five: 5, cinco: 5, six: 6, seis: 6,
  seven: 7, siete: 7, eight: 8, ocho: 8, nine: 9, nueve: 9, ten: 10, diez: 10,
};
const COURSE_LEVEL_VALUE = String.raw`(?:\d{1,2}|${Object.keys(COURSE_LEVEL_WORDS).join("|")})`;
const COURSE_LEVEL_LABEL = String.raw`(?:levels?|nivel(?:es)?)`;
const COURSE_LEVEL_RE = new RegExp(String.raw`\b${COURSE_LEVEL_LABEL}[\s-]*(${COURSE_LEVEL_VALUE})\b`, "gi");
const COURSE_LEVEL_RANGE_RE = new RegExp(
  String.raw`^\s*(?:[-–—/]|to|through|and|or|a|al|y|o|&)\s*(?:${COURSE_LEVEL_LABEL}\s*)?${COURSE_LEVEL_VALUE}\b`, "i",
);

function singleCourseLevel(text) {
  const levels = new Set();
  for (const claim of String(text || "").matchAll(COURSE_LEVEL_RE)) {
    // Ranges and descriptions of several classes do not establish one level.
    if (COURSE_LEVEL_RANGE_RE.test(text.slice(claim.index + claim[0].length))) return null;
    levels.add(COURSE_LEVEL_WORDS[claim[1].toLowerCase()] ?? Number(claim[1]));
  }
  return levels.size === 1 ? [...levels][0] : null;
}

const AGE_CLAIM_PATTERNS = [
  { re: /\bages?\s+(\d{1,2})\s*(?:[-–—]|to|through|thru)\s*(\d{1,2})\b/gi, open: false },
  { re: /\bages?\s+(\d{1,2})\s*\+/gi, open: true },
  { re: /\bages?\s+(\d{1,2})\s+(?:and|&)\s+(?:up|older|over)\b/gi, open: true },
];

function ageClaims(text) {
  const claims = [];
  for (const { re, open } of AGE_CLAIM_PATTERNS) {
    for (const m of String(text || "").matchAll(re)) {
      claims.push({ lo: Number(m[1]), hi: open ? null : Number(m[2]), index: m.index });
    }
  }
  return claims;
}

// The widest span the source itself vouches for. SJPL publishes several at
// once — a BiblioCommons audience tag ("Young Children, ages 0-5"), a
// recommended span ("ages 2 – 6"), and per-session gates ("(ages 3-8)") — and
// any of them can be the one a sentence is quoting, so they are unioned rather
// than required to agree.
function ageBounds(claims) {
  if (!claims.length) return null;
  return {
    lo: Math.min(...claims.map((c) => c.lo)),
    hi: claims.some((c) => c.hi === null) ? null : Math.max(...claims.map((c) => c.hi)),
  };
}

function ageClaimSupported(claim, bounds) {
  if (!bounds || claim.lo < bounds.lo) return false;
  if (bounds.hi === null) return true;
  return claim.hi !== null && claim.hi <= bounds.hi;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const ORDINALS = { "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4, "5th": 5, fifth: 5 };

// A series that runs a different activity each session publishes its WHOLE
// schedule on every occurrence, in one of two shapes:
//   "2nd Wednesday: Superhero Obstacle Course (ages 3-8)"   (ordinal weekday)
//   "Thursday, September 10: Bug headbands"                 (calendar date)
// Both mean a reader on one date must be told that date's activity and no
// other. The Craft Tuesdays & Thursdays corrections above exist because a
// cached blurb advertised the previous session's craft; this parser makes that
// failure detectable from the source instead of by hand-entry.
const ROTATION_MARKER = new RegExp(
  String.raw`\b(?:(1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth)\s+(${WEEKDAYS.join("|")})`
    + String.raw`|(?:(?:${WEEKDAYS.join("|")}),?\s+)?(${MONTHS.join("|")})\s+(\d{1,2}))\s*:\s+`,
  "gi",
);
// Where a schedule stops and the program's standing notes begin.
const ROTATION_TRAILER = /\b(?:free|recommended|registration|please|supplies|space is|all ages|this program|no registration)\b/i;

function parseSessionRotation(source) {
  const text = String(source || "");
  const markers = [...text.matchAll(ROTATION_MARKER)];
  // One marker is a date mentioned in passing; a rotation is a list.
  if (markers.length < 2) return [];
  return markers.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    let activity = text.slice(start, end);
    const trailer = activity.search(ROTATION_TRAILER);
    if (trailer >= 0) activity = activity.slice(0, trailer);
    return {
      ordinal: m[1] ? ORDINALS[m[1].toLowerCase()] : null,
      weekday: m[2] ? WEEKDAYS.indexOf(m[2].toLowerCase()) : null,
      month: m[3] ? MONTHS.indexOf(m[3].toLowerCase()) + 1 : null,
      day: m[4] ? Number(m[4]) : null,
      // Parentheticals carry the per-session age gate, which is checked as an
      // age claim in its own right, not as part of the activity's name.
      activity: activity.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim(),
    };
  }).filter((entry) => entry.activity);
}

/**
 * The scheduled activity for this event's OWN date, or "" when the source
 * publishes no rotation (or publishes one keyed to a different weekday than
 * the occurrence, which is a mismatch we decline to guess at).
 *
 * September 2026's Wednesdays are 2/9/16/23/30, so Sept 9 is the 2nd
 * Wednesday: "Superhero Obstacle Course".
 */
export function rotationActivityForOccurrence(event) {
  return rotationEntryForOccurrence(event)?.activity || "";
}

function rotationEntryForOccurrence(event) {
  const rotation = parseSessionRotation(sourceText(event));
  if (!rotation.length) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(event?.date || ""));
  if (!parts) return null;
  const [year, month, day] = parts.slice(1).map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const ordinal = Math.ceil(day / 7);
  return rotation.find((entry) => (entry.ordinal !== null
    ? entry.ordinal === ordinal && entry.weekday === weekday
    : entry.month === month && entry.day === day)) || null;
}

// "this week's playdate is the superhero obstacle course for ages 3 to 8" —
// subject captured separately so the claim can be tied to the event's own head
// noun. "this week's plan is a great one" is editorial voice, not a fact.
const SESSION_ACTIVITY_RE = /\bthis\s+(?:week|month)['’]?s\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2}?)\s+(?:is|will\s+be)\s+(?:the\s+|an?\s+)?([^.;,()]{3,60})/giu;
const ACTIVITY_TAIL = /\s+\b(?:for|at|on|in|with|from|starting|beginning)\b.*$/i;

/**
 * Validate source claims, not the model's earlier blurb. Empty/truncated
 * descriptions are not permission to invent whether an act is a cover band,
 * who a program is for, or which week's activity a reader will find.
 */
export function eventCopyFactConflict(text, event) {
  const copy = String(text || "");
  const source = sourceText(event);
  // "Art and storytime" establishes an art-viewing program, not making art.
  // Check newly generated variants as well as the known cached sentence.
  if (museumMinisWithoutArtMaking(event)) {
    for (const claim of copy.matchAll(new RegExp(ART_MAKING_ACTIVITY.source, "gi"))) {
      if (claimAppliesToEvent(copy, claim.index, event)) return "unsupported art-making activity";
    }
  }
  // A language class's heading and body can disagree (SJPL's Nivel 1 / nivel
  // cero listing). Neither alone establishes a definite course level. Check
  // fresh source text so a resolved disagreement stops blocking level claims.
  const title = [event?.rawTitle, event?.title].filter(Boolean).join(" ");
  if (/\b(?:english|esl|ell|ingl[eé]s)\b/i.test(title)) {
    const titleLevel = singleCourseLevel(title);
    const descriptionLevel = singleCourseLevel(event?.description);
    if (titleLevel !== null && descriptionLevel !== null && titleLevel !== descriptionLevel) {
      for (const claim of copy.matchAll(COURSE_LEVEL_RE)) {
        if (claimAppliesToEvent(copy, claim.index, event)) return "conflicting source course levels";
      }
    }
  }
  // The Meetup integration supplies a group credit instead of an event
  // description. A cafe/pub venue or figure-drawing title cannot establish
  // refreshments or a live model; reject those additions in carried, cached
  // and newly generated copy unless the source actually names them.
  if (event?.source === "Meetup" && /^Meetup event by [^\n]+\.?$/.test(String(event.description || "").trim())) {
    if ((/\b(?:over|with)\s+(?:a\s+)?coffee\b/i.test(copy) && !/\bcoffee\b/i.test(source))
        || (/\b(?:over|with)\s+(?:a\s+)?drinks?\b/i.test(copy)
          && !/\b(?:coffee|drinks?|beverages?|beer|wine|cocktails?)\b/i.test(source))) {
      return "unsupported refreshments in sparse Meetup listing";
    }
    if (/\blive\s+models?\b/i.test(copy) && !/\blive\s+models?\b/i.test(source)) {
      return "unsupported live model in sparse Meetup listing";
    }
    // A company in the title does not establish the jobs or affiliations of
    // people attending. A group credit is not an attendee/speaker biography.
    const title = [event.rawTitle, event.title].filter(Boolean).join(" ");
    for (const role of copy.matchAll(/\b(founder|engineer|employee|representative)s?\b/gi)) {
      if (!new RegExp(`\\b${role[1]}s?\\b`, "i").test(title)) {
        return "unsupported attendee role in sparse Meetup listing";
      }
    }
    if (/\baudience\s+(?:suggestions|prompts)\b/i.test(copy)
        && !/\baudience\s+(?:suggestions|prompts)\b/i.test(title)) {
      return "unsupported performance format in sparse Meetup listing";
    }
    if (/\bwatch\b[^.!?]*\bimprovis(?:ers?|ation)\b/i.test(copy)
        && !/\b(?:watch|performance|show)\b/i.test(title)) {
      return "unsupported spectator format in sparse Meetup listing";
    }
  }
  // A virtual event may name its organizing library as the venue. That is not
  // a physical destination; check carried/cached copy as well as new blurbs.
  if (event?.virtual === true
      && /\b(?:session|class|workshop|program|meeting|club)\s+(?:at|in)\s+the\s+library\b/i.test(copy)) {
    return "physical library attendance for online event";
  }
  if (/\b(?:cover|tribute)[\s-]+(?:bands?|acts?|groups?|artists?)\b/i.test(copy)
      && !/\b(?:cover|tribute)\b/i.test(source)) return "unsupported cover/tribute identity";
  if (/\b(?:original|founding)\s+(?:members?|vocalists?|singers?|lineup)\b/i.test(copy)
      && !/\b(?:original|founding)\s+(?:members?|vocalists?|singers?|lineup)\b/i.test(source)) {
    return "unsupported original-member identity";
  }
  if (/\bbanda\b/i.test(copy) && !/\bbanda\b/i.test(source)) return "unsupported banda genre";

  // Free homework help does not promise tutoring in every subject. SCCLD's
  // in-person program names Math and English; its separate online service
  // explicitly offers any subject. Require that broader promise in this
  // event's own source, including when checking carried or cached blurbs.
  // https://sccld.org/volunteer/ and https://sccld.org/kids-subject/learning/
  if (/\bhomework\b/i.test(event?.rawTitle || event?.title || "")
      && !/\b(?:any|all|every)\s+(?:school\s+|academic\s+)?subjects?\b/i.test(source)) {
    for (const claim of copy.matchAll(/\b(?:any|all|every)\s+(?:school\s+|academic\s+)?subjects?\b/gi)) {
      if (claimAppliesToEvent(copy, claim.index, event)) return "unsupported tutoring subject coverage";
    }
  }

  // This Delphian series lists the Bach, Mozart and other composer families;
  // "dynasties" in its title is not evidence of a program about royalty.
  // Evidence: docs/qa/2026-10-14-night-fact-check.md.
  if (/^Delphian Lectures: Meet the Instruments & Meet the Dynasties$/i.test(event?.title || "")
      && /\b(?:Bach|Mozart|Schumann|Strauss) Family\b/i.test(source)
      && !/\broyal\b/i.test(source)) {
    for (const claim of copy.matchAll(/\broyal (?:dynast(?:y|ies)|famil(?:y|ies))\b/gi)) {
      if (claimAppliesToEvent(copy, claim.index, event)) return "unsupported royal-dynasty topic";
    }
  }

  const bounds = ageBounds(ageClaims(source));
  for (const claim of ageClaims(copy)) {
    if (!claimAppliesToEvent(copy, claim.index, event)) continue;
    if (!ageClaimSupported(claim, bounds)) return "unsupported age range";
  }

  const head = titleHeadNoun(String(event?.rawTitle || event?.title || "").split(/\s[–—-]\s/)[0]);
  const scheduled = comparable(rotationActivityForOccurrence(event));
  const normalizedCopy = comparable(copy);
  const normalizedSource = comparable(source);
  for (const m of copy.matchAll(SESSION_ACTIVITY_RE)) {
    if (!claimAppliesToEvent(copy, m.index, event)) continue;
    // The claim has to be ABOUT this event: "this week's playdate is …" for a
    // playdate, not "this week's lineup is …" borrowed from a neighbouring
    // sentence.
    if (!head || !comparable(m[1]).split(" ").some((token) => singular(token) === head)) continue;
    const named = comparable(m[2].replace(ACTIVITY_TAIL, ""));
    if (named.length < 6 || !named.includes(" ")) continue;
    if (!normalizedSource.includes(named)) return "unsupported session activity";
    if (scheduled && !scheduled.includes(named) && !named.includes(scheduled)) {
      return "another session's rotation activity";
    }
  }

  // The same wrong-week claim without the "this week's X is Y" frame: naming a
  // rotation entry that belongs to a different session, and only that one.
  if (scheduled) {
    const strays = parseSessionRotation(source)
      .map((entry) => comparable(entry.activity))
      .filter((activity) => activity.length >= 6 && activity.includes(" ")
        && !scheduled.includes(activity) && normalizedCopy.includes(activity));
    if (strays.length && !normalizedCopy.includes(scheduled)) return "another session's rotation activity";
  }
  return null;
}
