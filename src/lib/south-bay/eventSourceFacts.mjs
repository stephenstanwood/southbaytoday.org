// Occurrence-specific corrections verified against first-party sources.
// Keep these upstream of blurb resolution so nightly refreshes cannot restore
// a sparse aggregator record or its previously invented cached copy.
// Evidence: docs/qa/2026-09-05-newsletter.md, 2026-09-06-newsletter.md, and
// 2026-09-08-newsletter.md.
import { REGISTRATION_APPOINTMENT, REGISTRATION_CLOSED, REGISTRATION_FULL, REGISTRATION_NONE, REGISTRATION_REQUIRED } from "./eventFilters.mjs";

const DERBY_ATTENDANCE = "12 first-come, first-served tickets. The library’s pickup instructions conflict with its 2 PM start; confirm pickup timing with Berryessa Library before going.";
const HILLVIEW_HALLOWEEN_TIMING = "The library lists the event for 12:30–1:30 PM, but its storytime breakdown uses a conflicting AM label. Confirm the session timing with Hillview Library.";
const LINKEDIN_STREAM_DESCRIPTION = "Stream-processing meetup hosted by LinkedIn, focused on Apache Kafka, Apache Flink, and Change Data Capture.";
const CORRECTIONS = [
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
  // The heading-only snapshot lost the club's email RSVP and ages 9+ copy,
  // and the calendar never states a price for this occurrence. Keep these
  // facts until the repaired scraper supplies its own scoped body.
  // https://www.lindentreebooks.com/events-calendar/
  // Evidence: docs/qa/2026-10-26-1807-fact-check.md.
  {
    date: "2026-11-29",
    title: /^Middle Grade Book Club: The Wish Ring Cipher$/i,
    venue: /^Linden Tree Books$/i,
    facts: {
      cost: null,
      registration: REGISTRATION_REQUIRED,
      kidFriendly: true,
      audienceAge: "kids",
      attendanceNote: "For readers ages 9 and older. Email the bookstore to RSVP using its events calendar.",
    },
  },
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
    ["2026-12-05", /^Rose Sellery Artist Talk and Gallery Tour$/i],
  ].map(([date, title]) => ({
    date, title, venue: /^Triton Museum of Art$/i,
    facts: {
      cost: "free", registration: REGISTRATION_REQUIRED,
      attendanceNote: "Free admission. RSVP through the organizer's Eventbrite page.",
    },
  })),
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
    facts: {
      cost: "free", kidFriendly: true,
      // The dated ticket page offers $0 adult/child RSVP tiers. Retain that
      // option without claiming registration is mandatory or sold out from
      // the checkout template's hidden "Sold Out!" heading.
      // Evidence: docs/qa/2026-10-26-2307-fact-check.md.
      attendanceNote: "The organizer offers free adult and child RSVPs through its ticket page. No parking at Montalvo. Use free parking and shuttle service from West Valley College.",
    },
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
  // This separate Halloween occurrence repeats the verified source conflict:
  // header 3–7 PM, body cooking at 5 PM and distribution 6:30–8 PM. Keep the
  // header fields and flag the conflict; do not select a replacement schedule.
  // https://www.meetup.com/san-jose-diet-meetup-group/events/316878539/
  // Evidence: docs/qa/2026-10-24-1107-fact-check.md (authenticated API record).
  {
    date: "2026-10-31",
    url: "https://www.meetup.com/san-jose-diet-meetup-group/events/316878539/",
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The organizer's event header lists 3–7 PM, but the description says cooking begins at 5 PM and meal distribution runs 6:30–8 PM. Confirm the volunteer schedule with Mantra Room before going.",
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
  // Evidence: docs/qa/2026-10-24-0407-fact-check.md (retained gateway response).
  {
    date: "2026-10-27",
    matches: (event) => event.url === "https://sjpl.bibliocommons.com/events/691fb8c1dff9d93e00d10dc4"
      && /\b60 minutes\b/i.test(event.description || "")
      && /\b30 minutes\b/i.test(event.attendanceNote || ""),
    facts: {
      attendanceStatus: "needs-confirmation",
      attendanceNote: "The library's description says ticket pickup starts 60 minutes before storytime, while its signup instructions say 30 minutes. Confirm pickup timing with Willow Glen Library.",
    },
    copyReplacements: [[/A limited number of tickets will be distributed at the Information Desk 60 minutes prior to the start of Storytime\./gi,
      "The library publishes conflicting ticket pickup instructions (60 or 30 minutes before storytime); confirm pickup timing with Willow Glen Library."]],
  },
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
  ...[
    ["2026-10-24", "6a3f10c0f56bd86e00b95e69", "Registration is requested but not required."],
    ["2026-10-24", "6a87354c46e4c80031cbd152", "Preregistration is recommended but not required. Limited to 20 participants; preregistered teens receive priority if capacity is reached."],
    ["2026-10-24", "68fc0358c313c23700ded894", "Registration is recommended. Walk-ins are welcome if space is available; the class is limited to 10 attendees."],
    ["2026-10-22", "6a83721e4cb69d003e216ef0", "Registration is encouraged but not required."],
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
  // The dated Meetup occurrence confirms November 1, 1:30–3:30 PM, Houge Park.
  // Evidence: docs/qa/2026-10-21-0507-fact-check.md.
  {
    date: "2026-11-01", url: "https://www.meetup.com/sj-astronomy/events/312677419/",
    facts: {
      registration: REGISTRATION_NONE, registrationClosesBy: null, cost: "free",
      attendanceNote: "Open to the public. Walk-ins welcome; a Meetup RSVP is optional.",
    },
  },
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
  // and docs/qa/2026-10-25-1407-fact-check.md (the October 27 source record).
  ...[
    ["2026-10-18", "6a85eaec69166f088b934e2d"],
    ["2026-10-20", "6a83713669166f088b92df77"],
    ["2026-10-27", "6a83713669166f088b92df78"],
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
