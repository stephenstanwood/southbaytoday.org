import assert from "node:assert/strict";
import test from "node:test";

import {
  isStudentOnlyEvent,
  isPublicEvent,
  inferCategory,
  isEventTimeBackfillCandidate,
  fetchSvlgEvents,
  isCampusOnlyLocalistAudience,
  mapTicketmasterEvent,
} from "../generate-events.mjs";

import {
  extractAddressLocality,
  extractSanJoseJazzDayUrls,
  extractVboSession,
  normalizeMidpenOccurrenceUrl,
  normalizeMountainWineryCard,
  normalizeSapCenterTitle,
  parseIcaExhibitionWindow,
  parseCivicPlusEventCost,
  parseCivicPlusEventDetail,
  parseCivicPlusEventTimes,
  parseHappyHollowSchedules,
  parseCivicPlusCalendarPage,
  parseJazzOnThePlazzSchedule,
  parseLosAltosHistoryEventFacts,
  parseMusicInParkSchedule,
  parseSanJoseJazzLineup,
  parseSvlgCalendar,
  parseSantanaRowOccurrences,
} from "./official-event-sources.mjs";

test("SVLG uses the calendar occurrence, preserving unknown hours and refusing malformed cards", () => {
  const card = `<article class="mec-event-article mec-toggle-202611-996">
    <h3 class="mec-event-title"><a href="https://svlg.org/events/example/">Public talk</a></h3>
    <div class="mec-event-description">A public conversation.</div>
    <span class="mec-start-date-label">18 Nov</span>
    <span class="mec-start-time">11:00 am</span><span class="mec-end-time">12:00 pm</span>
    <div class="mec-venue-details"><span>Conference Room</span><address>2480 N First St, San Jose</address></div>
  </article>`;
  assert.deepEqual(parseSvlgCalendar(card), [{title: "Public talk", url: "https://svlg.org/events/example/",
    date: "2026-11-18", time: "11:00 AM", endTime: "12:00 PM", venue: "Conference Room",
    address: "2480 N First St, San Jose", description: "A public conversation."}]);
  assert.equal(parseSvlgCalendar(card.replace('11:00 am', ''))[0].time, null);
  assert.throws(() => parseSvlgCalendar(card.replace('18 Nov', '31 Nov')), /valid/);
  assert.throws(() => parseSvlgCalendar(card.replace('18 Nov', '18 Dec')), /valid/);
  assert.throws(() => parseSvlgCalendar('<html>upstream error</html>'), /no recognizable/);
});

test("SVLG preserves an address in its venue span rather than a speaker's city", async () => {
  const html = `<article class="mec-event-article mec-toggle-202612-57124">
    <h3 class="mec-event-title"><a href="https://www.eventbrite.com/e/coffee-conversation-larry-klein-tickets-1998017392807">Coffee &amp; Conversation: Larry Klein</a></h3>
    <div class="mec-event-description">A conversation with Sunnyvale Mayor Larry Klein.</div>
    <span class="mec-start-date-label">10 Dec</span>
    <span class="mec-start-time">10:00 am</span><span class="mec-end-time">11:00 am</span>
    <div class="mec-venue-details"><span>2480 N First St San Jose, CA</span></div>
  </article>`;
  const [event] = parseSvlgCalendar(html);
  assert.equal(event.venue, "");
  assert.equal(event.address, "2480 N First St San Jose, CA");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(html, { status: 200 });
  try {
    const generated = await fetchSvlgEvents({ today: "2026-10-14" });
    assert.equal(generated[0].city, "san-jose");
    assert.equal(generated[0].address, "2480 N First St San Jose, CA");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ICA's published exhibition run ignores the post date and reception clocks", async () => {
  const text = "October 14, 2026 by SJICA. On view: October 16 — November 14, 2026. Opening during the Artists’ Mixer on Friday, October 16, 5-8pm.";
  const future = parseIcaExhibitionWindow(text, "2026-10-14");
  assert.deepEqual(future, {
    date: "2026-10-16", startDate: "2026-10-16", endDate: "2026-11-14",
    ongoing: true, time: null, endTime: null,
  });
  const { normalizePlaywrightEvent } = await import("../playwright-scrapers.mjs");
  const event = normalizePlaywrightEvent({
    title: "We Are California Artists: Wanxin Zhang and Diane Ding", source: "ICA San José",
    venue: "ICA San José", city: "san-jose", url: "https://www.icasanjose.org/current-exhibitions/wearecaliforniaartists/",
    ...future,
  });
  assert.equal(event.ongoing, true);
  assert.equal(event.startDate, "2026-10-16");
  assert.equal(event.endDate, "2026-11-14");
  assert.equal(event.time, null);
  assert.equal(isEventTimeBackfillCandidate(event), false);
  assert.equal(parseIcaExhibitionWindow(text, "2026-10-20").date, "2026-10-20");
  assert.equal(parseIcaExhibitionWindow(text, "2026-11-15"), null);
  assert.equal(parseIcaExhibitionWindow("October 14, 2026. Artists’ Mixer Friday, 5-8pm.", "2026-10-14"), null);
  assert.equal(parseIcaExhibitionWindow("On view: October 16 — November 31, 2026", "2026-10-14"), null);
  assert.equal(parseIcaExhibitionWindow("On view: December 16 — January 14, 2027", "2026-12-01").startDate, "2026-12-16");
});

test("SAP theme nights retain the hockey matchup and sports category", () => {
  const title = normalizeSapCenterTitle({ title: "Military Appreciation", subtitle: "Sharks vs Penguins" });
  assert.equal(title, "Sharks vs Penguins — Military Appreciation");
  assert.equal(inferCategory(title, "", "", "SAP Center"), "sports");
  assert.equal(normalizeSapCenterTitle({ title: "Sharks vs Penguins", subtitle: "Sharks vs Penguins" }), "Sharks vs Penguins");
  assert.equal(normalizeSapCenterTitle({ title: "Concert", subtitle: "With special guests" }), "Concert");
});

test("invitation-only coffee chats do not become public calendar destinations", () => {
  assert.equal(isPublicEvent("Service Now (Invite Only) Coffee Chat", "Santa Clara University", "", "Career Center"), false);
  assert.equal(isPublicEvent("Public Coffee Chat", "Santa Clara University", "Open to the public", "Community Center"), true);
});

test("Santana Row keeps each festival day's published hours", () => {
  // The October 2026 card header starts Saturday, but the daily schedule
  // includes Friday's preview. The first clock must not migrate to Saturday.
  const occurrences = parseSantanaRowOccurrences(
    "October 3 - October 4, 2026",
    "Friday, October 2nd from 3 pm – 9 pm" +
      "Saturday, October 3rd from 10 am – 9 pm" +
      "Sunday, October 4th from 10 am – 5 pm",
  );
  assert.deepEqual(occurrences, [
    { date: "2026-10-02", time: "3:00 PM", endTime: "9:00 PM" },
    { date: "2026-10-03", time: "10:00 AM", endTime: "9:00 PM" },
    { date: "2026-10-04", time: "10:00 AM", endTime: "5:00 PM" },
  ]);
});

test("Santana Row preserves different carving demonstration hours and noon", () => {
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 24 - October 25, 2026",
    "Saturday, October 24 | 10:00 AM – 1:00 PMSunday, October 25 | 12:00 PM – 2:00 PM",
  ), [
    { date: "2026-10-24", time: "10:00 AM", endTime: "1:00 PM" },
    { date: "2026-10-25", time: "12:00 PM", endTime: "2:00 PM" },
  ]);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 27, 2026", "Tuesday, October 27th from 10 AM – noon!",
  ), [{ date: "2026-10-27", time: "10:00 AM", endTime: "12:00 PM" }]);
});

test("Santana Row keeps single-date markets and rejects unsupported ranges", () => {
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 10, 2026", "Every second Saturday from 11am-6pm",
  ), [{ date: "2026-10-10", time: "11:00 AM", endTime: "6:00 PM" }]);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 22 - October 25, 2026", "See the film schedule for showtimes.",
  ), []);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 3 - October 4, 2026", "Doors at 3 PM. Various hours each day.",
  ), []);
  assert.deepEqual(parseSantanaRowOccurrences(
    "October 3, 2027", "Saturday, October 3 from 10 AM – 9 PM",
  ), []);
});

test("extracts the public locality from Squarespace address fields", () => {
  assert.equal(extractAddressLocality("Menlo Park, CA, 94025"), "Menlo Park");
  assert.equal(extractAddressLocality("1010 El Camino Real, Menlo Park, CA 94025"), "Menlo Park");
});

test("keeps exact Midpen occurrence URLs and rejects the generic calendar", () => {
  assert.equal(
    normalizeMidpenOccurrenceUrl("/events/guided-activities/ramble-rancho-15?utm_source=test"),
    "https://www.openspace.org/events/guided-activities/ramble-rancho-15",
  );
  assert.equal(
    normalizeMidpenOccurrenceUrl("https://www.openspace.org/events/volunteer-projects/habitat-restoration-thistle-removal-23"),
    "https://www.openspace.org/events/volunteer-projects/habitat-restoration-thistle-removal-23",
  );
  assert.equal(normalizeMidpenOccurrenceUrl("https://www.openspace.org/where-to-go/events-activities"), null);
  assert.equal(normalizeMidpenOccurrenceUrl("https://example.com/events/guided-activities/ramble-rancho-15"), null);
});

test("keeps Mountain Winery occurrence art tied to its exact event page", () => {
  assert.deepEqual(normalizeMountainWineryCard({
    title: "Gladys Knight",
    supporting: "Patrick McDermott",
    date: "Wed, Jul 22, 2026",
    time: "7:30 PM",
    link: "/events/detail?event_id=1350103",
    image: "https://images.discovery-prod.axs.com/2026/03/uploadedimage_69cb07b32dcb7.jpg",
    imageAlt: "Gladys Knight",
  }), {
    title: "Gladys Knight with Patrick McDermott",
    date: "Wed, Jul 22, 2026",
    time: "7:30 PM",
    link: "https://www.mountainwinery.com/events/detail?event_id=1350103",
    image: "https://images.discovery-prod.axs.com/2026/03/uploadedimage_69cb07b32dcb7.jpg",
    imageAlt: "Gladys Knight",
    imageSourceUrl: "https://www.mountainwinery.com/events/detail?event_id=1350103",
  });
  assert.equal(normalizeMountainWineryCard({
    title: "Gladys Knight",
    date: "Wed, Jul 22, 2026",
    link: "https://www.mountainwinery.com/concert-series",
  }), null);
});

test("does not double the connector when the supporting act carries its own", () => {
  const card = (supporting) => normalizeMountainWineryCard({
    title: "Switchfoot",
    supporting,
    date: "Wed, Jul 22, 2026",
    link: "/events/detail?event_id=1383144",
  }).title;
  assert.equal(card("with Anberlin"), "Switchfoot with Anberlin");
  assert.equal(card("w/ Anberlin"), "Switchfoot with Anberlin");
  assert.equal(card("Anberlin"), "Switchfoot with Anberlin");
  // "special guest" reads correctly after the connector and carries real
  // billing info, so only the connector itself is stripped.
  assert.equal(
    card("with special guest Anberlin"),
    "Switchfoot with special guest Anberlin",
  );
  // A supporting line that is only a connector adds nothing — no dangling "with".
  assert.equal(card("with"), "Switchfoot");
});

test("extracts the current VBO event.asp session redirect", () => {
  assert.equal(
    extractVboSession('window.location.href = "https://plugin.vbotickets.com/v5.0/event.asp?s=dad2e075-98fa-4855-951d-f2e41fe6f1d6";'),
    "dad2e075-98fa-4855-951d-f2e41fe6f1d6",
  );
});

test("parses the official Music in the Park schedule", () => {
  const html = `
    <strong>2026 Concert Schedule:</strong>
    <p>July 19 - The Houserockers &nbsp;</p>
    <p>August 23 - Harry and the Hitmen</p>
  `;
  assert.deepEqual(parseMusicInParkSchedule(html), [
    { date: "2026-07-19", performer: "The Houserockers" },
    { date: "2026-08-23", performer: "Harry and the Hitmen" },
  ]);
});

test("parses the official Jazz on the Plazz schedule", () => {
  const html = `
    <p>Summer Concerts 2026</p>
    <h3>July 22nd</h3><h3>Tony Lindsay &amp; The Soul Soldiers</h3>
    <p>The longtime Santana vocalist returns.</p>
    <h3>Aug 26th</h3><h3>Gunhild Carling<br />Season Finale</h3>
    <p>Classic jazz and swing.</p>
  `;
  assert.deepEqual(parseJazzOnThePlazzSchedule(html), [
    {
      date: "2026-07-22",
      performer: "Tony Lindsay & The Soul Soldiers",
      description: "The longtime Santana vocalist returns.",
    },
    {
      date: "2026-08-26",
      performer: "Gunhild Carling",
      description: "Classic jazz and swing.",
    },
  ]);
});

test("parses one artist occurrence from the official San Jose Jazz lineup", () => {
  const html = `
    <title>San Jose Jazz Summer Fest 2026</title>
    <div class="artist col-sm-12 col-md-6 col-lg-4 ">
      <div class="artist-overlay content-lineup">
        <span class="month-date">Aug 7</span>
        <span class="time">5:45pm</span>
        <span class="stage-name 2">Jay Paul Company Main Stage</span>
        <div class="quicklook-text"><p>French Caribbean singer and bassist.</p></div>
      </div>
      <img src="https://example.com/adi.jpg">
      <h3><a href="https://summerfest.sanjosejazz.org/artists/adi-oasis">Adi Oasis</a></h3>
    </div>
  `;
  assert.deepEqual(parseSanJoseJazzLineup(html), [
    {
      title: "Adi Oasis",
      date: "2026-08-07",
      time: "5:45 PM",
      stage: "Jay Paul Company Main Stage",
      url: "https://summerfest.sanjosejazz.org/artists/adi-oasis",
      image: "https://example.com/adi.jpg",
      description: "French Caribbean singer and bassist.",
    },
  ]);
});

test("discovers current San Jose Jazz day pages without hardcoded year slugs", () => {
  const html = `
    <a href="/filters/chronological/friday-aug-7">Friday</a>
    <a href="https://summerfest.sanjosejazz.org/filters/chronological/saturday-aug-8?view=all">Saturday</a>
    <a href="/filters/chronological/friday-aug-7">Friday mobile duplicate</a>
    <a href="https://example.com/filters/chronological/sunday-aug-9">Wrong host</a>
  `;
  assert.deepEqual(extractSanJoseJazzDayUrls(html), [
    "https://summerfest.sanjosejazz.org/filters/chronological/friday-aug-7",
    "https://summerfest.sanjosejazz.org/filters/chronological/saturday-aug-8",
  ]);
});

test("parses CivicPlus schema events that its incomplete RSS feed omits", () => {
  const html = `
    <li><h3><a id="eventTitle_2023" href="/Calendar.aspx?EID=2023"><span>Downtown Park Outreach - Farmers' Markets</span></a></h3>
      <div class="subHeader"><div class="date">July&nbsp;23,&nbsp;2026,&nbsp;4:00 PM&thinsp;-&thinsp;7:00 PM</div></div>
      <div class="hidden" itemscope itemtype="http://schema.org/Event"><span itemprop="name">Downtown Park Outreach - Farmers' Markets</span><span itemprop="startDate" class="hidden">2026-07-23T16:00:00</span><p itemprop="description">Tell us what you think.</p>
      <span itemprop="location" itemscope itemtype="http://schema.org/Place"><span itemprop="name"><p>State St &amp; Third St.</p></span><span class="hidden" itemprop="address" itemscope itemtype="http://schema.org/PostalAddress"><span itemprop="addressLocality">Los Altos</span><span itemprop="addressRegion">CA</span><span itemprop="postalCode">94022</span></span></span></div>
    </li>`;
  assert.deepEqual(parseCivicPlusCalendarPage(html), [{
    id: "2023",
    title: "Downtown Park Outreach - Farmers' Markets",
    startsAt: "2026-07-23T16:00:00",
    time: "4:00 PM",
    endTime: "7:00 PM",
    description: "Tell us what you think.",
    venue: "State St & Third St.",
    address: "Los Altos, CA 94022",
    href: "/Calendar.aspx?EID=2023",
  }]);
});

test("splits CivicPlus start and end clocks without inventing all-day times", () => {
  assert.deepEqual(parseCivicPlusEventTimes("07:30 PM - 09:30 PM"), {
    time: "7:30 PM",
    endTime: "9:30 PM",
  });
  assert.deepEqual(parseCivicPlusEventTimes("12:00 AM - 11:59 PM"), {
    time: null,
    endTime: null,
  });
});

test("reads venue, address, time, and ticket floor from a CivicPlus detail page", () => {
  const detail = parseCivicPlusEventDetail(`
    <span itemprop="startDate">2026-09-04T19:30:00</span>
    <div class="specificDetailHeader">Time:</div>
    <div class="specificDetailItem">7:30 PM&thinsp;-&thinsp;9:30 PM</div>
    <div id="ctl00_MainContent_ModuleContent_ctl00_ctl04_location_name">
      <div itemprop="name">The Heritage Theatre</div>
    </div>
    <span itemprop="streetAddress">1 W Campbell Ave</span>
    <span itemprop="addressLocality">Campbell</span>
    <span itemprop="addressRegion">CA</span>
    <span itemprop="postalCode">95008</span>
    <div itemprop="price">$30.50/$43.50/$55.50 + $4 FF and $5 processing fee</div>
  `);

  assert.deepEqual(detail, {
    startsAt: "2026-09-04T19:30:00",
    time: "7:30 PM",
    endTime: "9:30 PM",
    venue: "The Heritage Theatre",
    address: "1 W Campbell Ave, Campbell, CA 95008",
    costText: "$30.50/$43.50/$55.50 + $4 FF and $5 processing fee",
    cost: "paid",
    costNote: "From $30.50",
  });
});

test("does not let a limited free offer erase a paid CivicPlus ticket floor", () => {
  assert.deepEqual(parseCivicPlusEventCost("Free"), { cost: "free", costNote: null });
  assert.deepEqual(parseCivicPlusEventCost("$20; children free"), {
    cost: "low",
    costNote: "From $20",
  });
});

test("reads Los Altos History Museum prices and blocks closed sessions", () => {
  assert.deepEqual(
    parseLosAltosHistoryEventFacts("Cost: $15 per person\\; $10 for Museum members."),
    { unavailable: false, cost: "low", costNote: "$15; $10 members" },
  );
  assert.deepEqual(
    parseLosAltosHistoryEventFacts("Cost: $15 per person\\; $10 for Museum members. This session is closed."),
    { unavailable: true, cost: null, costNote: null },
  );
});

test("derives Happy Hollow's published recurring and dated events", () => {
  const entries = parseHappyHollowSchedules({
    seniorHtml: "<p>The 2026 season is here! Join us the fourth Thursday of the month from May through October from 9-10 a.m.</p>",
    hoorayHtml: "<p>Hooray for you! The Hooray for Happy Hollow benefit event is Saturday, Sept. 12, 2026.</p>",
  });
  assert.equal(entries.length, 7);
  assert.deepEqual(entries.slice(0, 2).map((entry) => entry.date), ["2026-05-28", "2026-06-25"]);
  assert.equal(entries.at(-1).date, "2026-09-12");
});

function ticketmasterEvent(overrides = {}) {
  return {
    id: "example",
    name: "Example Show",
    dates: {
      start: { localDate: "2026-08-21", localTime: "19:30:00" },
      status: { code: "onsale" },
    },
    priceRanges: [{ type: "standard", currency: "USD", min: 0, max: 0 }],
    url: "https://www.ticketmaster.com/example/event/example",
    classifications: [{ segment: { name: "Arts & Theatre" }, genre: { name: "Comedy" } }],
    _embedded: {
      venues: [{
        name: "Example Venue",
        city: { name: "San Jose" },
        address: { line1: "1 Example St" },
      }],
    },
    ...overrides,
  };
}

test("keeps credible Ticketmaster zero-price events free", () => {
  assert.equal(mapTicketmasterEvent(ticketmasterEvent()).cost, "free");
});

test("does not call paid TicketWeb Improv shows free", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    url: "https://www.ticketweb.com/event/desi-banks-san-jose-improv-tickets/14880633",
    _embedded: {
      venues: [{
        name: "San Jose Improv",
        city: { name: "San Jose" },
        address: { line1: "62 S Second St" },
      }],
    },
  }));

  assert.equal(mapped.cost, "paid");
  assert.equal(mapped.costNote, undefined);
});

test("maps Ticketmaster local times with the Pacific offset in effect that day", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    dates: {
      start: { localDate: "2026-11-02", localTime: "18:00:00" },
      status: { code: "onsale" },
    },
  }));
  assert.equal(mapped.displayDate, "Mon, Nov 2");
  assert.equal(mapped.time, "6:00 PM");
});

test("restores Bay FC's full San Diego Wave FC opponent name", () => {
  const mapped = mapTicketmasterEvent(ticketmasterEvent({
    name: "Bay FC vs. San Diego FC",
    dates: {
      start: { localDate: "2026-11-01", localTime: "14:00:00" },
      status: { code: "onsale" },
    },
  }));
  assert.equal(mapped.title, "Bay FC vs. San Diego Wave FC");
  assert.equal(mapped.time, "2:00 PM");
});

test("drops Stanford events restricted to known campus audiences, preserving public access", () => {
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: [{ name: "Students" }],
  }), true);
  // Actual DAAAS Alumni Homecoming audience tags, October 15, 2026.
  const campus = ["Students", "Students - Undergraduates", "Students - Graduates",
    "Postdocs", "Faculty", "Staff", "Staff - Academic", "Staff - Managers", "Alumni"];
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: campus.map((name) => ({ name })),
  }), true);
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: [{ name: "Students" }, { name: "General Public" }],
  }), false);
  assert.equal(isCampusOnlyLocalistAudience({
    event_audience: [...campus, "General Public"],
  }), false);
  assert.equal(isCampusOnlyLocalistAudience({ event_audience: ["Affiliates"] }), true);
  assert.equal(isCampusOnlyLocalistAudience({ event_audience: ["Affiliates", "Everyone"] }), false);
  assert.equal(isCampusOnlyLocalistAudience({ event_audience: ["Community Members"] }), false);
  assert.equal(isCampusOnlyLocalistAudience({}), false);
});

test("drops SCU technology training and Handshake registration listings", () => {
  assert.equal(isStudentOnlyEvent({
    link: "https://events.scu.edu/technology-training/event/453288-excel-essentials-training",
    title: "Excel: Essentials Training",
    description: "Hands-on training.",
  }), true);
  assert.equal(isStudentOnlyEvent({
    link: "https://events.scu.edu/live/events/506201-fall-bash-career-fair",
    title: "Fall Bash Career Fair",
    description: "Register for the Bash Career Fair on Handshake!",
  }), true);
});

test("drops SJSU's internal door competition while keeping public student art", () => {
  assert.equal(isStudentOnlyEvent({
    link: "https://events.sjsu.edu/event/departemnt-door-decorating-competition",
    title: "Department Door Decorating Competition",
    description: "We are seeking departments across campus to transform their office doors into Spartan showcases.",
  }), true);
  assert.equal(isStudentOnlyEvent({
    link: "https://events.sjsu.edu/event/student-art-exhibition",
    title: "Student Art Exhibition",
    description: "Student artists share their work in an exhibition open to the public.",
  }), false);
});
