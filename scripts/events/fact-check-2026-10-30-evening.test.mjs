import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { isEventPublishable } from "../../src/lib/south-bay/eventOccurrence.mjs";
import { classifyAudienceAge } from "../../src/lib/south-bay/audienceAge.mjs";
import { requiresAdvanceRegistration } from "../../src/lib/south-bay/eventFilters.mjs";
import { snapshotEvent, resolveRetired } from "../../src/lib/south-bay/eventSlugLedger.mjs";
import { fetchInboundEvents } from "../generate-events.mjs";
import { scrapeSJJazz, scrapeTheTechUpcoming } from "../playwright-scrapers.mjs";

const { events } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-10-30-evening.json", import.meta.url)));
const row = (id) => structuredClone(events.find((event) => event.id === id));

test("all three Zoe Caron newsletter copies keep required tickets after venue extraction", () => {
  const copies = [
    ["Artist Reception & Gallery Talk with Zoe Caron", "MVCPA SecondStage, 500 Castro St, Mountain View, CA 94041"],
    ["Zoe Caron Artist Reception & Gallery Talk", "MVCPA SecondStage, 500 Castro St, Mountain View, CA 94041"],
    ["Artist Reception & Gallery Talk featuring Zoe Caron", "Mountain View Center for the Performing Arts, SecondStage, 500 Castro Street, Mountain View, CA"],
  ].map(([title, location], i) => ({
    id: `zoe-newsletter-${i}`, title, location, cityKey: "mountain-view",
    startsAt: "2026-11-04T17:30:00-08:00", endsAt: "2026-11-04T19:30:00-08:00",
    description: "Artist reception and gallery talk.", sourceUrl: null,
  }));
  const actual = fetchInboundEvents({ events: copies, today: "2026-10-30" }).map(applyVerifiedEventFacts);
  assert.equal(actual.length, 3);
  for (const event of actual) {
    assert.equal(event.venue, "MVCPA SecondStage");
    assert.equal(event.registration, "required");
    assert.equal(event.cost, "free");
    assert.equal(event.url, "https://tickets.mvcpa.com/eventperformances.asp?evt=802");
    assert.equal(requiresAdvanceRegistration(event), true);
    assert.equal(event.time, "5:30 PM"); assert.equal(event.endTime, "7:30 PM");
  }
});

test("membership vouchers do not become an October outing or a replacement December session", async () => {
  const offer = row("f8a1a9940e42");
  assert.equal(isEventPublishable(offer), false);
  assert.equal(isEventPublishable({ ...offer, title: "DIY Cookie Cutters", date: "2026-12-06" }), true);
  const result = await scrapeTheTechUpcoming({
    goto: async () => {}, waitForTimeout: async () => {},
    evaluate: async () => [
      { title: offer.title, date: "October 31, 2026 10:00AM", venue: "The Tech Interactive" },
      { title: "DIY Cookie Cutters", date: "December 6, 2026 10:00AM", venue: "The Tech Interactive" },
    ],
  }, { today: "2026-10-30" });
  assert.deepEqual(result.map((event) => event.title), ["DIY Cookie Cutters"]);
});

test("a calendar date cannot override an explicit replacement-day-TBD notice", () => {
  const workshop = row("paloalto-6ae51db6198b996a80a982a1");
  assert.equal(isEventPublishable(workshop), false);
  for (const description of [
    "This workshop has been rescheduled to January 31, 2027 at 4 PM.",
    "If necessary, this workshop will be rescheduled to another day. Room assignment TBD.",
    "Join us for this writing workshop. Instructor TBD.",
  ]) assert.equal(isEventPublishable({ ...workshop, description }), true, description);
});

test("retired URLs retain the pending-date notice without retaining an event clock", () => {
  for (const source of [row("f8a1a9940e42"), row("paloalto-6ae51db6198b996a80a982a1")]) {
    const actual = snapshotEvent(source);
    assert.equal(actual.time, undefined); assert.equal(actual.endTime, undefined);
    assert.ok(actual.description.length < 600);
    assert.equal(isEventPublishable(actual), false);
  }
});

test("a withdrawn offer cannot redirect to a different activity sharing the calendar URL", () => {
  const offer = row("f8a1a9940e42");
  const other = { ...offer, id: "slime", title: "Spooky Science Slime Lab", time: "11:00 AM" };
  const result = resolveRetired({ entries: [{ slug: "withdrawn-offer", event: snapshotEvent(offer) }] }, [other], [], "2026-10-30");
  assert.equal(result.redirects.size, 0);
  assert.equal(result.orphans.length, 1);
  assert.equal(result.orphans[0].event.time, undefined);
  assert.doesNotMatch(result.orphans[0].event.blurb, /pick up free cookie cutters/);
});

test("dated jazz corrections keep showtimes, real venues and distinct admission", () => {
  for (const [id, cost, venue] of [
    ["81b5500edc90", "paid", "SJZ Break Room"],
    ["7b510d6897c4", "free", "SJZ Break Room"],
    ["f5e39bdd207e", "free", "Plaza de César Chávez"],
  ]) {
    const source = row(id), actual = applyVerifiedEventFacts(source);
    assert.equal(actual.venue, venue); assert.equal(actual.cost, cost);
    assert.equal(actual.category, "music");
    for (const field of ["date", "time", "endTime", "url"]) assert.equal(actual[field], source[field]);
    assert.doesNotMatch(actual.blurb, /San Jose Jazz Venue/);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
    const nextYear = { ...source, date: source.date.replace(/^2026/, "2027") };
    assert.deepEqual(applyVerifiedEventFacts(nextYear), nextYear);
  }
});

test("jazz scraping preserves the supplied venue and musical context without making up a venue", async () => {
  let page = 0;
  const actual = await scrapeSJJazz({
    goto: async () => ({ status: () => ++page === 1 ? 200 : 404 }),
    waitForTimeout: async () => {},
    evaluate: async () => [
      { title: "Emily Day & The Cosmo Alleycats", date: "Fri, Nov 13", time: "8pm", venue: "SJZ Break Room", description: "Led by jazz vocalist Emily Day.", link: row("81b5500edc90").url },
      { title: "Public concert", date: "Fri, Nov 13", time: "8pm" },
    ],
  }, { today: "2026-10-30" });
  assert.equal(actual[0].venue, "SJZ Break Room");
  assert.equal(actual[0].category, "music");
  assert.match(actual[0].description, /jazz vocalist/);
  assert.equal(actual[1].venue, null);
});

test("newsletter room prefixes use the named facility and never invent a street address", () => {
  const inputs = ["Lobby", "Social Hall", "Fiction Room"].map((room, i) => ({
    id: `room-${i}`, cityKey: "mountain-view", title: "Public workshop",
    startsAt: "2026-11-12T13:00:00-08:00", location: `${room}, Mountain View Senior Center, Mountain View`,
  }));
  const actual = fetchInboundEvents({ today: "2026-10-30", events: inputs });
  assert.equal(actual.length, 3);
  actual.forEach((event, i) => {
    assert.equal(event.venue, "Mountain View Senior Center");
    assert.equal(event.address, inputs[i].location);
  });
});

test("original newsletter registration survives without reopening full or closed events", () => {
  for (const id of ["inbound-5de61bd8b331bef9", "inbound-d55d59735caee151", "inbound-d685604abf69633d", "inbound-bf322d781cbaaafb", "inbound-1f502719f21d2cd3"]) {
    const source = row(id), actual = applyVerifiedEventFacts(source);
    assert.equal(actual.registration, "required");
    assert.ok(actual.attendanceNote.length > 20);
    const classified = applyVerifiedEventFacts({ ...actual, audienceAge: classifyAudienceAge(actual) });
    if (/Quarry Park/.test(actual.title)) {
      assert.equal(classified.audienceAge, "all");
      assert.equal(actual.url, "https://saratoga.volunteerlocal.com/volunteer/?id=53322");
    } else if (/Mountain View/.test(actual.venue)) assert.equal(classified.audienceAge, "adult");
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...source, registration }).registration, registration);
    }
    const later = { ...source, date: "2027-11-21" };
    assert.deepEqual(applyVerifiedEventFacts(later), later);
  }
});

test("free city events retain their clocks and the verified puzzle participation link", () => {
  for (const id of ["inbound-f505cefbce39682c", "inbound-802dd8d8ba3f6b8c"]) {
    const source = row(id), actual = applyVerifiedEventFacts(source);
    assert.equal(actual.cost, "free");
    assert.equal(actual.venue, "Mountain View Senior Center");
    assert.equal(actual.time, source.time); assert.equal(actual.endTime, source.endTime);
    assert.deepEqual(applyVerifiedEventFacts(actual), actual);
  }
});

test("the dated market retains newsletter-backed facts while unverified artwork claims stay out", () => {
  const source = row("inbound-406d94c61dc893a7"), actual = applyVerifiedEventFacts(source);
  assert.equal(actual.title, "Downtown Palo Alto Farmers' Market");
  assert.equal(actual.url, "https://www.pafarmersmarket.org/");
  assert.equal(actual.category, "food");
  assert.match(actual.description, /Gaby Castro.*9:30 AM/);
  assert.doesNotMatch(actual.description + actual.blurb, /trick-or-treat|scavenger|creepy-crawlies|pumpkins/i);
  for (const field of ["date", "time", "endTime", "venue", "address", "cost"]) assert.equal(actual[field], source[field]);
  assert.deepEqual(applyVerifiedEventFacts(actual), actual);
});
