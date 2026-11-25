// Editorial suppressions for withdrawn occurrences and event rows still
// awaiting first-party reconfirmation. A review date is a prompt to recheck
// the source, not an automatic expiry.

export const EVENT_EDITORIAL_SUPPRESSIONS = Object.freeze([
  Object.freeze({
    date: "2026-11-24",
    title: /^Fall Crafts for Grades K-5$/i,
    venue: /^Milpitas Library$/i,
    matches: event => event.source === "City Newsletter" && event.time === "3:30 PM"
      && /^https:\/\/sccl\.bibliocommons\.com\/v2\/events\?/.test(event.url || ""),
    reason: "The newsletter calendar copy omits the signup limit and can linger after the library occurrence ends. The library's November 24 occurrence is already archived with its registration deadline.",
    source: "https://sccl.bibliocommons.com/v2/events/6add3e7629c3d60033323c19",
  }),
  Object.freeze({
    ids: Object.freeze(["sjpl-6b06060b3377ce00332d69af"]),
    matches: (event) => normalizeDate(event.date) === "2026-11-30",
    reason: "The library calendar lists November 30 for Fall Finals Study Hall at Almaden. The description starts December 7. The library has not independently confirmed the November occurrence.",
    source: "https://sjpl.bibliocommons.com/v2/events?series=6b06011bc225ba002c10299c",
  }),
  Object.freeze({
    date: "2027-01-22",
    title: /^Tech & Innovation Summit$/i,
    venue: /.*/,
    matches: event => event.source === "SVLG"
      && /^https:\/\/www\.eventbrite\.com\/e\/tech-innovation-summit-tickets-2002660719121(?:[/?#]|$)/.test(event.url || ""),
    reason: "The organizer's registration page restricts the summit to employees of Silicon Valley Leadership Group member companies.",
    source: "https://www.eventbrite.com/e/tech-innovation-summit-tickets-2002660719121",
  }),
  Object.freeze({
    date: "2026-11-28",
    title: /^Pacific Art League Gallery Open Saturday$/i,
    venue: /^Pacific Art League(?:,|$)/i,
    matches: (event) => event.source === "City Newsletter" && !event.url,
    reason: "The published exhibition schedule lists other extended Saturdays and gives weekends by appointment. The extracted newsletter row has no verifiable link for public November 28 hours.",
    source: "https://www.pacificartleague.org/105-anniversary-and-fundraiser",
  }),
  Object.freeze({
    date: "2026-12-01",
    title: /^Art Talk with Jim Caldwell: Preview of the de Young's Pharaoh Exhibition \(In Person\)$/i,
    venue: /^Pacific Art League(?:,|$)/i,
    matches: (event) => event.source === "City Newsletter" && !event.url,
    reason: "The extracted newsletter row supplies no event or RSVP link. The league's public calendar does not confirm the December 1 occurrence.",
    source: "https://www.pacificartleague.org/events",
  }),
  Object.freeze({
    date: "2026-12-12",
    title: /^Family Storytime(?: at Cupertino Library)?$/i,
    venue: /^Cupertino Library$/i,
    matches: (event) => event.time === "10:30 AM"
      && /^https:\/\/sccl\.bibliocommons\.com\/(?:v2\/)?events\/6a08e108e13d3b4603b486f4\/?$/.test(event.url || ""),
    reason: "Both library pages point to Room 101 at 10:30 AM. Keep the specific Winter Storytime listing, which gives the household admission limits.",
    source: "https://sccl.bibliocommons.com/v2/events/6afe8547e4f7a1002c08ec05",
  }),
  Object.freeze({
    title: /^A Christmas Carol(?: presented by Silicon Valley Shakespeare)?$/i,
    venue: /^Montalvo Arts Center$/i,
    date: "2026-12-04",
    matches: event => /^https:\/\/(?:my\.montalvoarts\.org\/3261\/3262|(?:www\.)?svshakespeare\.org\/carol)\/?(?:[?#].*)?$/.test(event.url || ""),
    reason: "Montalvo's dated page gives 6 PM and directs ticket buyers to Silicon Valley Shakespeare, which lists 7:30 PM for evening performances. Withhold the opening until the producer confirms its start.",
    source: "https://my.montalvoarts.org/3261/3262",
  }),
  Object.freeze({
    title: /^Building Evidentiary Infrastructure During an Active War: Lessons from the Ukraine War Archive$/i,
    venue: /.*/,
    date: "2026-11-20",
    matches: event => event.source === "Stanford Events"
      && /^https:\/\/events\.stanford\.edu\/event\/building-evidentiary-infrastructure-during-an-active-war-lessons-from-the-ukraine-war-archive\/?(?:[?#].*)?$/.test(event.url || ""),
    reason: "Stanford restricts both the room and the webinar to university affiliates. The shortened calendar listing omitted the restriction.",
    source: "https://events.stanford.edu/event/building-evidentiary-infrastructure-during-an-active-war-lessons-from-the-ukraine-war-archive",
  }),
  ...[
    ["2026-12-02", "534032"],
    ["2026-12-04", "534030"],
    ["2026-12-09", "534030"],
  ].map(([date, calendarId]) => Object.freeze({
    title: /^Coherence (?:Open Call )?Auditions$/i,
    venue: /.*/,
    date,
    matches: event => /^https:\/\/events\.scu\.edu\/(?:(?:arts-and-sciences\/)?event|live\/events)\/(\d+)(?:-[^/?#]+)?(?:[/?#]|$)/.exec(event.url || "")?.[1] === calendarId,
    reason: "SCU's full calendar description invites its students, alumni, faculty and staff to audition. The shortened listing omitted that eligibility.",
    source: "https://events.scu.edu/live/rss/events",
  })),
  Object.freeze({
    title: /^Manage Your Research Presence Online$/i,
    venue: /.*/,
    date: "2026-12-01",
    matches: event => /^https:\/\/events\.scu\.edu\/(?:(?:library\/)?event|live\/events)\/513402(?:-[^/?#]+)?(?:[/?#]|$)/i.test(event.url || ""),
    reason: "Santa Clara University Library lists faculty and graduate students as the workshop audience. Public eligibility is unconfirmed.",
    source: "https://libguides.scu.edu/workshops",
  }),
  Object.freeze({
    title: /^Hanukkah Menorah Lighting$/i,
    venue: /.*/,
    date: "2026-12-04",
    matches: event => /^https:\/\/events\.scu\.edu\/(?:center-for-spirituality-and-faith\/event|live\/events)\/533921(?:-[^/?#]+)?(?:[/?#]|$)/i.test(event.url || ""),
    reason: "SCU's dated calendar confirms the lighting but supplies no description or public audience. Withhold until the organizer confirms public attendance.",
    source: "https://events.scu.edu/live/rss/events",
  }),
  Object.freeze({
    title: /^OneInMath: Math Program for K[ -]?3(?:rd)?\b/i,
    venue: /^Village Square Library$/i,
    date: "2026-11-21",
    matches: event => event.time === "3:00 PM"
      && /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/6af61c5c9bd80b00451901ab(?:[/?#]|$)/.test(event.url || ""),
    reason: "Two library series list the same 3 PM class at Village Square on November 21. The organizer's fall schedule and the original library series agree on one class.",
    source: "https://oneinmath.com/classes/",
  }),
  Object.freeze({
    title: /^OneInMath: Math Program for K[ -]?3(?:rd)?\b/i,
    venue: /^Village Square Library$/i,
    date: "2026-11-28",
    matches: event => event.time === "3:00 PM"
      && /^https:\/\/sjpl\.bibliocommons\.com\/(?:v2\/)?events\/6af61c5c9bd80b00451901ac(?:[/?#]|$)/.test(event.url || ""),
    reason: "The library lists a 3 PM class on November 28. OneInMath's fall schedule ends Village Square sessions on November 21. Withhold this occurrence pending organizer confirmation.",
    source: "https://oneinmath.com/classes/",
  }),
  Object.freeze({
    ids: Object.freeze(["midpen-ab148fc7be0d9c6e"]),
    title: /^Sierra Azul Preserve - Trail Maintenance: Mt\. Umunhum Trail \(Pt\. 6\)$/i,
    venue: /^Sierra Azul Preserve$/i,
    date: "2026-11-19",
    reason: "Midpen's volunteer portal marks this occurrence canceled. The overview calendar can still show its old listing.",
    source: "https://volunteer.openspace.org/need/detail/?need_id=1326256",
  }),
  Object.freeze({
    title: /^Enhance your Professional Development with LinkedIn Learning$/i,
    venue: /.*/,
    date: "2026-12-01",
    matches: event => /^https:\/\/events\.scu\.edu\/(?:leavey-school-of-business\/event|live\/events)\/533869(?:-[^/?#]+)?(?:[/?#]|$)/.test(event.url || ""),
    reason: "Leavey's event description places the Graduate Business Programs careers webinar on Zoom. The RSS entry omits that description and falls back to a campus venue.",
    source: "https://events.scu.edu/leavey-school-of-business/event/533869-enhance-your-professional-development-with",
  }),
  ...["2026-11-23", "2026-11-30"].map(date => Object.freeze({
    title: /^All Recovery Meeting(?: at Student Union)?$/i,
    venue: /.*/,
    date,
    matches: event => /^https:\/\/events\.sjsu\.edu\/event\/all-recovery-meeting-3060(?:[/?#]|$)/.test(event.url || ""),
    reason: "SJSU's Student Wellness Center invites students to this recovery meeting. The organizer does not list public eligibility.",
    source: "https://events.sjsu.edu/event/all-recovery-meeting-3060",
  })),
  Object.freeze({
    title: /^Spirit of the Row: HSAS Full Ensemble & Vocal Ensemble$/i,
    venue: /.*/,
    date: "2026-12-15",
    matches: event => event.source === "San Jose Jazz"
      && /^https:\/\/sanjosejazz\.org\/events\/spirit-of-the-row-hsas-full-ensemble-vocal-ensemble\/?(?:[?#].*)?$/.test(event.url || ""),
    reason: "San Jose Jazz mentions Santana Row in the description and Hammer Theatre in the header. Santana Row confirms the holiday program, but its December 15 lineup omits HSAS. The ensemble's appearance and venue need confirmation.",
    source: "https://santanarow.com/events/",
  }),
  Object.freeze({
    title: /^129th Big Game: Stanford vs\. Cal Football$/i,
    venue: /.*/,
    date: "2026-11-21",
    matches: event => /^https:\/\/tickets\.gostanford\.com\/events?\/football-at-cal-ys8n9b(?:[/?#]|$)/.test(event.url || ""),
    reason: "Stanford's dated ticket page and football schedule place this away game at California Memorial Stadium in Berkeley. The newsletter publisher's Palo Alto address does not make it a local game.",
    source: "https://tickets.gostanford.com/events/football-at-cal-ys8n9b",
  }),
  Object.freeze({
    title: /^SimplyAnalytics Workshop$/i,
    venue: /.*/,
    date: "2026-11-16",
    matches: event => event.source === "Stanford Events" && !event.description
      && !(event.sourceAudiences || []).some(audience => /^(?:General Public|Everyone)$/i.test(audience)),
    reason: "Stanford's full organizer record invites Stanford University community members and lists campus audiences plus Members, without General Public or Everyone. Public eligibility is unconfirmed; this is not a cancellation.",
    source: "https://events.stanford.edu/event/simplyanalytics-2026-11-16",
  }),
  Object.freeze({
    title: /^Harvesting Hope\s*\|\s*Community, Culture\s*&\s*Action$/i,
    venue: /^SCU Forge Garden$/i,
    date: "2026-11-17",
    reason: "SCU's complete organizer record invites students, faculty and staff and gives a November 10 RSVP deadline. The empty RSS excerpt does not establish public eligibility. Withhold until public access is confirmed; this is not a cancellation.",
    source: "https://events.scu.edu/ignatian-center/event/524988-harvesting-hope-community-culture-action",
  }),
  Object.freeze({
    title: /^New Faculty Research Lifecycle Workshop$/i,
    venue: /.*/,
    date: "2026-11-17",
    reason: "SCU's organizer record identifies Faculty as the audience for this research-services workshop. Public eligibility is unconfirmed; this is not a cancellation.",
    source: "https://events.scu.edu/library/event/513401-new-faculty-research-lifecycle-workshop",
  }),
  Object.freeze({
    title: /^Surgery M&M$/i,
    venue: /^Li Ka Shing Center$/i,
    date: "2026-11-10",
    reason: "Stanford CME identifies Surgery M&M as a HIPAA-restricted, Department of Surgery-only activity. The sparse Localist listing does not confirm public eligibility. Withhold this occurrence; this is not a cancellation.",
    source: "https://stanford.cloud-cme.com/course/courseoverview?EID=57525&P=0",
  }),
  Object.freeze({
    title: /^Find Your Space in the Library$/i,
    venue: /.*/,
    date: "2026-11-11",
    reason: "SCU addresses this library orientation to commuter and transfer students. Withhold until public eligibility is confirmed; this is not a cancellation.",
    source: "https://events.scu.edu/library/event/521864-find-your-space-in-the-library",
  }),
  Object.freeze({
    title: /^DNAxAI Series: Demo Day! See It, Try It, Use It: AI Tools for Research$/i,
    venue: /.*/,
    date: "2026-11-11",
    reason: "SCU's complete organizer record addresses this workshop to Leavey faculty and requests an RSVP by November 9. Withhold until public eligibility is confirmed; this is not a cancellation.",
    source: "https://events.scu.edu/leavey-school-of-business/event/525136-dnaxai-series-demo-day-see-it-try-it-use-it-ai",
  }),
  Object.freeze({
    title: /^Queer\s*&\s*Qualified\s*-\s*Networking 101$/i,
    venue: /.*/,
    date: "2026-11-10",
    reason: "SCU identifies this career workshop as a Student Organizations / Undergraduate Business program. Public eligibility is unconfirmed; this is not a cancellation.",
    source: "https://events.scu.edu/leavey-school-of-business/event/521785-queer-qualified-networking-101",
  }),
  Object.freeze({
    title: /^Find Your Space in the Library$/i,
    venue: /.*/,
    date: "2026-11-10",
    reason: "SCU addresses this library orientation to commuter and transfer students. Withhold until public eligibility is confirmed; this is not a cancellation.",
    source: "https://events.scu.edu/library/event/521863-find-your-space-in-the-library",
  }),
  Object.freeze({
    title: /^(?:Campus Reading Program, November 9 Events!?|I, Robot - Campus Reading Discussion)$/i,
    venue: /.*/,
    date: "2026-11-09",
    reviewOn: "2026-11-09",
    reason:
      "The current SJSU listing covers a 3:30–4:30 PM discussion and names only SJSU employees and students as its audience. Withhold until public eligibility is confirmed; this is not a cancellation.",
    source: "https://events.sjsu.edu/event/campus-reading-program-november-9-events",
  }),
  ...["2026-11-05", "2026-11-06"].map(date => Object.freeze({
    title: /^Campus Reading Program, November 9 Events!?$/i,
    venue: /.*/,
    date,
    reviewOn: "2026-11-09",
    reason:
      "The calendar row is a reminder. The organizer's poster places the discussion and film on November 9, starting at 3:30 PM, not at midnight on this date.",
    source: "https://events.sjsu.edu/event/campus-reading-program-november-9-events",
  })),
  ...["2026-11-05", "2026-11-06", "2026-11-09"].map(date => Object.freeze({
    title: /^Silent Movie Classic with Live Score Performance!?\s*Don't Miss It!?$/i,
    venue: /.*/,
    date,
    reviewOn: "2026-11-10",
    reason:
      "The calendar row is a reminder. The organizer places the Metropolis screening on November 10 at 3:30 PM in King Library Room 225, not at midnight on this date. Its published finish times conflict.",
    source: "https://events.sjsu.edu/event/silent-movie-classic-with-live-score-performance-dont-miss-it",
  })),
  Object.freeze({
    title: /^First Fridays Collab Lab$/i,
    venue: /^(?:Braun Music Center|Stanford University)$/i,
    date: "2026-11-06",
    reviewOn: "2026-11-06",
    reason:
      "The organizer's full description invites Stanford faculty, staff and students, while its calendar tags say General Public and Everyone. Withhold this occurrence until public eligibility is confirmed; this is not a cancellation.",
    source: "https://events.stanford.edu/event/collab-lab-nov6",
  }),
  Object.freeze({
    title: /^Search for What Matters, Featuring Fr\. Andrew Laguna, SJ$/i,
    venue: /^(?:Williman Room, Benson|Santa Clara University)$/i,
    date: "2026-11-10",
    reviewOn: "2026-11-10",
    reason:
      "The organizer describes a luncheon for faculty and staff and requires an RSVP. Withhold this occurrence until public eligibility is confirmed; this is not a cancellation.",
    source: "https://events.scu.edu/live/events/517450-search-for-what-matters-featuring-fr-andrew-laguna",
  }),
  ...["2026-11-05", "2026-11-06"].map(date => Object.freeze({
    title: /^Music Library Association California Chapter Annual Meeting$/i,
    venue: /.*/,
    date,
    reviewOn: "2026-11-05",
    reason:
      "The organizer lists Members and restricts attendance to meeting registrants. Its detailed agenda uses 2025 beside 2026 calendar occurrences and names Braun Music Center for the first-day tour while the event location says Hohbach Hall. Withhold until public eligibility, dates and meeting points are confirmed; this is not a cancellation.",
    source: "https://events.stanford.edu/event/music-library-association-california-chapter-annual-meeting",
  })),
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
    // An optional predicate narrows a dated hold to its reviewed stale source
    // shape, so fresh eligibility evidence can supersede that hold.
    if (rule.matches && !rule.matches(event)) return false;
    // A building-entry restriction does not disqualify online-only access.
    if (rule.physicalOnly && event.virtual === true) return false;
    if (rule.ids?.some((candidate) => candidate === id || url.includes(candidate.replace(/^[a-z]+-/, "")))) {
      return true;
    }
    if (date !== rule.date) return false;
    return rule.title.test(title) && rule.venue.test(venue);
  });
}
