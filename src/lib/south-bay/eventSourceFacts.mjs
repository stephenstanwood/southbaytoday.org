// Occurrence-specific corrections verified against first-party sources.
// Keep these upstream of blurb resolution so nightly refreshes cannot restore
// a sparse aggregator record or its previously invented cached copy.
// Evidence: docs/qa/2026-09-05-newsletter.md, 2026-09-06-newsletter.md, and
// 2026-09-08-newsletter.md.
import { REGISTRATION_APPOINTMENT, REGISTRATION_CLOSED, REGISTRATION_FULL, REGISTRATION_NONE, REGISTRATION_REQUIRED } from "./eventFilters.mjs";

const DERBY_ATTENDANCE = "12 first-come, first-served tickets. The library’s pickup instructions conflict with its 2 PM start; confirm pickup timing with Berryessa Library before going.";
const CORRECTIONS = [
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
  // These dated Milpitas occurrences exist, but their shared body conflicts
  // with itself about the class term and lists assessment dates already past.
  // Preserve the occurrence clocks without promising new enrollment or
  // guessing a corrected term. This is not evidence that classes are closed.
  // Evidence: docs/qa/2026-10-18-0407-fact-check.md (all five source records).
  ...[
    ["2026-10-19", "6a5992919943bdf31e9f816b"],
    ["2026-10-21", "6a5992919943bdf31e9f816c"],
    ["2026-10-26", "6a5992919943bdf31e9f816d"],
    ["2026-10-28", "6a5992919943bdf31e9f816e"],
    ["2026-11-02", "6a5992919943bdf31e9f816f"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sccl.bibliocommons.com/events/${sourceId}`,
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
  })),
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
    facts: { url: "https://live.stanford.edu/events/26-27season/studio/jack-west-guitars-on-life/" },
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
  // These two Bascom occurrence pages explicitly say registration is
  // recommended but not required. The presence/deadline of their signup form
  // does not establish an admission requirement. Keep this exception dated;
  // do not relax the conservative provider rule for other library programs.
  // Evidence: docs/qa/2026-10-17-2107-fact-check.md (fresh occurrence HTML).
  ...[
    ["2026-10-18", "6a85eaec69166f088b934e2d"],
    ["2026-10-20", "6a83713669166f088b92df77"],
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
  // the staff role; preserve the source's wording on the two listed sessions.
  // https://sjpl.bibliocommons.com/events/68df10f9023ff328007ce8c8
  // Evidence: docs/qa/2026-10-15-1307-fact-check.md.
  ...[
    ["2026-10-15", "68df10f9023ff328007ce8c8"],
    ["2026-10-17", "68df10f9023ff328007ce8c9"],
  ].map(([date, sourceId]) => ({
    date, url: `https://sjpl.bibliocommons.com/events/${sourceId}`,
    copyReplacements: [[/\bfrom a librarian at Willow Glen Library\b/gi, "from a tech tutor at Willow Glen Library"]],
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
  // Tully's Day 3 title and SJPL's published five-session curriculum agree;
  // this occurrence's copied English/Spanish body still names Day 1's topic.
  // Remove those conflicting fragments rather than inventing session copy.
  // https://www.sjpl.org/news/esl-workforce-development-workshops/
  // Evidence: docs/qa/2026-10-15-0507-fact-check.md.
  {
    date: "2026-10-15", url: "https://sjpl.bibliocommons.com/events/6aa1bf97101eb7003f2ec8f0",
    copyReplacements: [
      [/\bWorkshop Topic:\s*Professional Introductions\s*&\s*My Skills\s*/g, ""],
      [/\bTema del taller:\s*Presentaciones Profesionales y Mis Habilidades\s*/g, ""],
    ],
  },
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
  // Earlier English-only cleanup left its 30 attached to the next sentence;
  // the organizer requires ALL first-time participants to sign the waiver.
  // https://sjpl.bibliocommons.com/events/6aa49028101eb7003f2f6dfd
  // Evidence: docs/qa/2026-10-15-0407-fact-check.md.
  {
    date: "2026-10-15", url: "https://sjpl.bibliocommons.com/events/6aa49028101eb7003f2f6dfd",
    copyReplacements: [[/\b30\s+first-time participants will need to sign a waiver form\b/gi, "First-time participants will need to sign a waiver form"]],
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
    title: /^Bob Marley: How Reggae Changed the World/i, venue: /The Studio/i,
    facts: {
      url: "https://live.stanford.edu/events/26-27season/studio/bob-marley/",
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
      description: "Explore a small ocean swallowed with Shelby Hendricks through art and science. Meet in the first-floor lobby. The tour is included with museum admission and is open to all ages.",
      blurb: "Explore a small ocean swallowed through art and science with Shelby Hendricks.",
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
    // A range is inclusive and must have both bounds; it is reserved for a
    // verified exhibition run whose displayed date advances each day.
    const matchesDate = c.date ? event?.date === c.date
      : Boolean(c.dateFrom && c.dateThrough && event?.date >= c.dateFrom && event?.date <= c.dateThrough);
    return matchesDate && (
      (c.id && event.id === c.id) || (c.url && event.url === c.url)
        || c.aliasUrls?.includes(event.url)
        || (c.title?.test(event.title || "") && c.venue?.test(event.venue || ""))
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
