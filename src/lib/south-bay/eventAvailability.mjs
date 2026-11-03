// Editorial suppressions for withdrawn occurrences and event rows still
// awaiting first-party reconfirmation. A review date is a prompt to recheck
// the source, not an automatic expiry.

export const EVENT_EDITORIAL_SUPPRESSIONS = Object.freeze([
  Object.freeze({
    title: /^Post-Election SVLG Member Briefing$/i,
    venue: /.*/,
    date: "2026-11-06",
    reviewOn: "2026-11-06",
    reason:
      "The organizer's ticket page identifies an online Zoom briefing open to employees of SVLG member companies. The sparse calendar card does not establish a public in-person event in San Jose.",
    source: "https://www.eventbrite.com/e/post-election-svlg-member-briefing-tickets-2003679941643",
  }),
  Object.freeze({
    title: /^Svrmp Relaunch Mentorship Kickoff Event$/i,
    venue: /^(?:Old Union|Stanford University)$/i,
    date: "2026-11-03",
    reviewOn: "2026-11-03",
    reason:
      "The current Localist occurrence says November 3, but its full Event Details explicitly say Thursday, October 29, 2026. Withhold the conflicting date until the organizer reconfirms it; this is not a cancellation.",
    source: "https://events.stanford.edu/event/svrmp-relaunch-mentorship-kickoff-event",
  }),
  Object.freeze({
    title: /^Coffee Hour$/i,
    venue: /^(?:Theory Center, Neurosciences Building \(2nd Floor\)|Stanford University)$/i,
    date: "2026-11-04",
    reviewOn: "2026-11-04",
    reason:
      "The full organizer listing limits its invitation to Stanford affiliates. Keep sparse copies out of the public feed until public eligibility is confirmed.",
    source: "https://events.stanford.edu/event/am-coffee-hour-2918",
  }),
  Object.freeze({
    title: /^Bicycle Handling Skills Class$/i,
    venue: /^(?:Galvez(?: Parking)? Lot|Stanford University)$/i,
    date: "2026-11-03",
    reviewOn: "2026-11-03",
    reason:
      "Stanford's explicit restricted_to field and full listing limit this class to Stanford students, faculty and staff. Keep sparse copies out of the public feed until public eligibility is confirmed.",
    source: "https://events.stanford.edu/event/bicycle-handling-skills-class",
  }),
  ...["2026-11-20", "2026-12-18"].map(date => Object.freeze({
    title: /^Mountain View Makers Market$/i,
    venue: /.*/,
    date,
    reviewOn: "2026-11-03",
    reason:
      "The newsletter extraction lists 3–8 PM, while the city's 2026 vendor FAQ lists 2–8 PM. The August original is outside available receiving-account history and the current organizer page could not be fetched within its access policy. Withhold these hours until a current first-party occurrence resolves the conflict; this is not a cancellation.",
    source: "https://econdev.mountainview.gov/home/showpublisheddocument/13299/639148679773000000",
  })),
  Object.freeze({
    title: /^Njioma Grevious Violin Recital$/i,
    venue: /^Bing Concert Hall$/i,
    date: "2027-02-05",
    reviewOn: "2026-11-03",
    reason:
      "Only June newsletter extractions establish this date and time. The original is outside available receiving-account history, and a current accessible first-party occurrence has not independently confirmed them. Withhold the listing until confirmation is recovered; this is not a cancellation.",
    source: "https://live.stanford.edu/events/26-27season/bing-concert-hall/njioma-grevious-violin-recital/",
  }),
  Object.freeze({
    title: /^Renée Qin and Ania Filochows?ka: The World We Speak Into Being$/i,
    venue: /^The Studio(?: at Bing Concert Hall)?$/i,
    date: "2027-02-04",
    reviewOn: "2026-11-03",
    reason:
      "June newsletter extractions and a season announcement establish the artists and program, but a current accessible first-party occurrence has not independently confirmed the February 4 date and 7 PM time. The original is outside available receiving-account history. Withhold the listing until confirmation is recovered; this is not a cancellation.",
    source: "https://live.stanford.edu/events/26-27season/studio/renee-qin-and-ania-filochowska-the-world-we-speak-into-being/",
  }),
  Object.freeze({
    title: /^Rihab Chaieb(?:[:\s]|$)/i,
    venue: /^Bing Concert Hall$/i,
    date: "2027-02-24",
    reviewOn: "2026-11-03",
    reason:
      "The June newsletter extraction lists 7:30 PM, but its original is outside available receiving-account history. The October 3 review corrected the artist's identity, without retaining occurrence evidence for this clock, and current accessible first-party evidence does not establish it. Withhold this listing until its start time is confirmed; this is not a cancellation.",
    source: "https://live.stanford.edu/events/26-27season/bing-concert-hall/rihab-chaieb-nomad-the-eternal-wanderer/",
  }),
  Object.freeze({
    title: /^300 Paintings(?: by Sam Kissajukian)?$/i,
    venue: /^The Studio(?: at Bing Concert Hall)?$/i,
    date: "2027-03-03",
    reviewOn: "2026-11-03",
    reason:
      "Stanford's season announcement and the artist's schedule confirm March 3–6, but do not establish the extracted 7 PM start. The June original is outside available receiving-account history; the October 3 identity correction did not retain occurrence evidence for this clock. Withhold this listing until the performance time is confirmed; this is not a cancellation.",
    source: "https://news.stanford.edu/stories/2026/05/stanford-live-new-season",
  }),
  Object.freeze({
    title: /^(?:Hysterical:\s*)?Zavior Phillips(?:\s*\((?:7|9):00 PM show\))?$/i,
    venue: /^The Studio(?: at Bing Concert Hall)?$/i,
    date: "2027-04-02",
    reviewOn: "2026-11-03",
    reason:
      "Only a July 24 newsletter extraction attributes these showtimes. The original message is outside available mailbox history, and current organizer evidence does not independently confirm the times. Withhold them until first-party confirmation is recovered; this is not a cancellation.",
    source: "https://live.stanford.edu/events/26-27season/studio/hysterical-zavior-phillips",
  }),
  Object.freeze({
    ids: Object.freeze(["sjpl-69c41db41e64afd01e64a8d9"]),
    title: /^Halloween Interactive Activity$/i,
    venue: /^Mt\.? Pleasant(?: Neighborhood)?(?: Library)?$/i,
    date: "2026-10-27",
    reviewOn: "2026-10-31",
    reason:
      "The live SJPL occurrence page and exact API record identify a past March 25–April 6, 2026 run. The cached October 21–31 run is no longer confirmed; withhold it until the library reconfirms those dates.",
    source: "https://sjpl.bibliocommons.com/v2/events/69c41db41e64afd01e64a8d9",
  }),
  Object.freeze({
    title: /^Learn to Ride Class$/i,
    venue: /^(?:Galvez Parking Lot|Stanford University)$/i,
    date: "2026-10-27",
    reviewOn: "2026-10-27",
    reason:
      "The organizer explicitly limits this free class to Stanford students, faculty and staff. Keep shortened copies out of the public feed until public eligibility is confirmed.",
    source: "https://events.stanford.edu/event/learn-to-ride-class",
  }),
  Object.freeze({
    title: /^Australia['’]s new social media legislation: the world is watching$/i,
    venue: /^(?:Building 120, McClatchy Hall, Main Quad|Stanford University)$/i,
    date: "2026-10-27",
    reviewOn: "2026-10-27",
    physicalOnly: true,
    reason:
      "The room instructions require a Stanford ID card/mobile ID to enter the building. Keep sparse physical copies withheld; the organizer separately offers online access.",
    source: "https://events.stanford.edu/event/australias-new-social-media-legislation-the-world-is-watching",
  }),
  Object.freeze({
    title: /^San Jose 7 Claude Techniques You['’]ll Use Tomorrow$/i,
    venue: /^Walsh\s*(?:&|and)\s*Northwestern$/i,
    date: "2026-10-25",
    reviewOn: "2026-10-25",
    reason:
      "The organizer's linked ClaudeVibeCode product explicitly runs live on Zoom. Meetup's PHYSICAL flag does not establish an event at this street intersection.",
    source: "https://www.aiventurelab.org/product/ClaudeVibeCode",
  }),
  Object.freeze({
    title: /^EH&S:\s*Flu\s*&\s*COVID-19 Vaccination Clinic$/i,
    venue: /^(?:Stanford University|484 Oak Road(?:, Stanford(?:, CA 94305)?)?)$/i,
    date: "2026-10-26",
    reviewOn: "2026-10-26",
    reason:
      "The occurrence's eligibility section lists Stanford students, faculty, staff, postdocs, retirees and campus affiliates, despite its generic Everyone tag. Public eligibility is not established.",
    source: "https://events.stanford.edu/event/ehs-flu-covid-19-vaccination-clinic",
  }),
  Object.freeze({
    title: /^EH&S:\s*Flu\s*&\s*COVID-19 Vaccination Clinic$/i,
    venue: /^(?:Stanford University|484 Oak Road(?:, Stanford(?:, CA 94305)?)?)$/i,
    date: "2026-10-27",
    reviewOn: "2026-10-27",
    reason:
      "This occurrence repeats the campus-affiliate eligibility restriction despite its Everyone tag. Keep shortened or stale copies out until public eligibility is confirmed.",
    source: "https://events.stanford.edu/event/ehs-flu-covid-19-vaccination-clinic-640",
  }),
  Object.freeze({
    title: /\bengelbert humperdinck\b/i,
    venue: /^california theatre$/i,
    date: "2026-10-21",
    reviewOn: "2027-07-18",
    reason:
      "The venue and presenter explicitly rescheduled October 21, 2026 to July 18, 2027. Suppress only the withdrawn date, including stale Timely and ticket-feed copies.",
    source: "https://www.sanjose.org/theaters/events/engelbert-humperdinck",
  }),
  Object.freeze({
    ids: Object.freeze(["sccl-6a5a7fe7fa641fe01af3cb52"]),
    title: /lotus lantern craft/i,
    venue: /cupertino library/i,
    date: "2026-08-19",
    reviewOn: "2026-08-26",
    reason:
      "SCCL BiblioCommons occurrence page and gateway record do not confirm this date or time.",
    source: "https://sccl.bibliocommons.com/events/6a5a7fe7fa641fe01af3cb52",
  }),
  Object.freeze({
    ids: Object.freeze(["sjpl-69d5759be2a2952aed0d5074"]),
    title: /wee explore outdoors/i,
    venue: /educational park/i,
    date: "2026-08-19",
    reviewOn: "2026-08-26",
    reason:
      "SJPL BiblioCommons occurrence page and gateway record do not confirm this date or time.",
    source: "https://sjpl.bibliocommons.com/events/69d5759be2a2952aed0d5074",
  }),
  Object.freeze({
    ids: Object.freeze(["sjpl-6a7e0ae8d4b10d0030064691"]),
    title: /knitting\/crocheting\/tatting\/bobbin lace club/i,
    venue: /east sj carnegie/i,
    date: "2026-08-19",
    reviewOn: "2026-08-26",
    reason:
      "SJPL BiblioCommons occurrence page and gateway record do not confirm this date or time.",
    source: "https://sjpl.bibliocommons.com/events/6a7e0ae8d4b10d0030064691",
  }),
  Object.freeze({
    ids: Object.freeze(["tm-Z7r9jZ1A7x78p"]),
    title: /dru hill/i,
    venue: /mountain winery/i,
    date: "2026-08-22",
    reviewOn: "2026-08-29",
    reason:
      "Mountain Winery first-party concert pages do not confirm this date; Ticketmaster is the only listing.",
    source: "https://www.ticketmaster.com/dru-hill-w-ginuwine-saratoga-california-08-22-2026/event/Z7r9jZ1A7x78p",
  }),
]);

function normalizeDate(value) {
  return String(value || "").slice(0, 10);
}

export function isEventEditoriallySuppressed(event) {
  if (!event || typeof event !== "object") return false;

  const id = String(event.id || "");
  const title = String(event.title || event.name || "");
  const venue = String(event.venue || "");
  const date = normalizeDate(event.date);
  const url = String(event.url || "");

  return EVENT_EDITORIAL_SUPPRESSIONS.some((rule) => {
    // A building-entry restriction does not disqualify online-only access.
    if (rule.physicalOnly && event.virtual === true) return false;
    if (rule.ids?.some((candidate) => candidate === id || url.includes(candidate.replace(/^[a-z]+-/, "")))) {
      return true;
    }
    if (date !== rule.date) return false;
    return rule.title.test(title) && rule.venue.test(venue);
  });
}
