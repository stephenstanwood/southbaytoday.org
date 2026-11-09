import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scrapeCupertinoOpenCities } from "../playwright-scrapers.mjs";
import { fetchInboundEvents } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";
import { requiresAdvanceRegistration, requiresAttendanceConfirmation } from "../../src/lib/south-bay/eventFilters.mjs";
import { isBriefingEventAvailable } from "../lib/city-briefing-integrity.mjs";
import { resolveRetired, retireSlugs } from "../../src/lib/south-bay/eventSlugLedger.mjs";

const { events } = JSON.parse(readFileSync(new URL("../lib/fixtures/fact-check-2026-11-09-midday.json", import.meta.url)));
const row = id => structuredClone(events.find(e => e.id === id));

test("Brass Queens publication replaces another act's biography and keeps the verified showtime", async () => {
  const event = row("d42e1c65bf1b"), before = structuredClone(event);
  await resolveEventBlurbs([event], { enabled: false });
  assert.match(event.description, /female-led brass band from New York/);
  assert.match(event.blurb, /Brass Queens/);
  assert.doesNotMatch(event.description + event.blurb, /Black Nile|Aaron|Lawrence/);
  assert.equal(event.cost, "paid"); assert.equal(event.costNote, "$27 including fees");
  for (const key of ["id", "date", "time", "endTime", "title", "url", "venue"]) assert.equal(event[key], before[key], key);
  assert.deepEqual(applyVerifiedEventFacts(event), event);
  for (const other of [
    { ...before, date: "2027-12-03" }, { ...before, venue: "Another room" },
    { ...before, title: "Black Nile" }, { ...before, url: "https://sanjosejazz.org/events/black-nile/" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

function cupertinoPage(details) {
  let current = "";
  return {
    goto: async url => { current = url; }, waitForTimeout: async () => {},
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
    evaluate: async () => current.endsWith("Events-directory")
      ? details.map((d, i) => ({ text: "13 Nov 2026", href: `https://www.cupertino.gov/fixture-${i}` }))
      : details[Number(current.match(/fixture-(\d+)$/)[1])],
  };
}

test("OpenCities ingestion reads explicit inline admission and all-attendee signup without treating other money as a price", async () => {
  const base = { title: "Join-A-Ranger: Night Hike and Flashlight Tour", slots: ["Friday, January 15, 2027 | 06:00 PM - 07:30 PM"],
    location: "McClellan Ranch Preserve, 22221 McClellan Rd, 95014", tags: "Kids & family", cost: "",
    description: "All attendees must register and children must be accompanied by an adult. $10 Resident | $13 Non-resident" };
  const actual = await scrapeCupertinoOpenCities(cupertinoPage([
    base,
    { ...base, title: "Community gathering", description: "Celebrate a $1 million grant. No registration is required." },
    { ...base, title: "Free family workshop", cost: "Free", description: "No registration is required." },
    { ...base, title: "Children's breakfast", cost: "$18 residents, $22 nonresidents. Children must register; adults do not need to register.", description: "Breakfast with families." },
  ]), { today: "2026-11-09" });
  assert.equal(actual.length, 4);
  assert.equal(actual[0].cost, "low"); assert.equal(actual[0].costNote, "$10 Resident | $13 Non-resident");
  assert.equal(actual[0].registration, "required");
  assert.equal(actual[0].time, "06:00 PM"); assert.equal(actual[0].endTime, "07:30 PM");
  assert.equal(actual[1].cost, null); assert.equal(actual[1].registration, undefined);
  assert.equal(actual[2].cost, "free"); assert.equal(actual[2].registration, undefined);
  assert.equal(actual[3].cost, "low"); assert.equal(actual[3].registration, "required");
});

test("the five dated ranger hikes keep admission on retained rows without reopening closed booking", async () => {
  const hikes = events.filter(e => e.title.startsWith("Join-A-Ranger"));
  assert.equal(hikes.length, 5);
  for (const source of hikes) {
    const event = structuredClone(source);
    await resolveEventBlurbs([event], { enabled: false });
    assert.equal(event.cost, "low"); assert.equal(requiresAdvanceRegistration(event), true);
    assert.match(event.costNote, /\$10 resident; \$13 nonresident/);
    assert.match(event.attendanceNote, /All attendees must register.*Children must be accompanied/);
    assert.equal(event.time, source.time); assert.equal(event.endTime, source.endTime);
    assert.deepEqual(applyVerifiedEventFacts(event), event);
    for (const registration of ["full", "closed", "appointment-only"]) {
      assert.equal(applyVerifiedEventFacts({ ...source, registration }).registration, registration);
    }
    for (const other of [
      { ...source, date: "2027-03-06" }, { ...source, url: source.url + "-other" },
      { ...source, description: "Registration is no longer required." },
    ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  }
});

test("the museum's conflicting workshop clocks remain unset through newsletter ingestion and cached-copy publication", async () => {
  const source = row("inbound-8ae3d349571bf89b");
  const [ingested] = fetchInboundEvents({ today: "2026-11-09", events: [{
    id: "little-rams", title: source.title, startsAt: "2027-01-30T13:00:00-08:00", endsAt: "2027-01-30T15:00:00-08:00",
    sourceUrl: source.url, cityKey: source.city, location: source.address, description: source.description,
  }] });
  assert.ok(ingested);
  ingested.blurb = source.blurb;
  await resolveEventBlurbs([ingested], { enabled: false });
  assert.equal(ingested.time, null); assert.equal(ingested.endTime, null);
  assert.equal(ingested.cost, "paid"); assert.match(ingested.costNote, /\$30/);
  assert.equal(requiresAttendanceConfirmation(ingested), true);
  assert.equal(isBriefingEventAvailable(ingested), false);
  assert.match(ingested.attendanceNote, /1–3 PM.*10 AM–noon Pacific/);
  assert.deepEqual(applyVerifiedEventFacts(ingested), ingested);
  for (const other of [
    { ...source, date: "2028-01-30" }, { ...source, venue: "Another studio" },
    { ...source, url: source.url.replace("2004454841389", "2004454841390") },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("dated newsletter source links survive fresh ingestion and retained records without replacing later URLs", () => {
  for (const [id, url] of [
    ["inbound-a18c318cd2bffe84", "https://content.govdelivery.com/accounts/CASUNNYVALE/bulletins/431c99d"],
    ["inbound-6e7f3959967a1f2f", "https://www.tritonmuseum.org/book-club"],
  ]) {
    const source = row(id), fixed = applyVerifiedEventFacts(source);
    assert.equal(fixed.url, url);
    assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
    const time = source.time === "1:00 PM" ? "13:00" : "09:30";
    const [fresh] = fetchInboundEvents({ today: "2026-11-09", events: [{ id, title: source.title,
      startsAt: `${source.date}T${time}:00-08:00`, location: source.address, cityKey: source.city, sourceUrl: null,
    }] });
    assert.equal(fresh.url, url);
    for (const other of [{ ...source, date: "2027-12-02" }, { ...source, url: "https://example.com/new-details" }, { ...source, venue: "Another venue" }]) {
      assert.deepEqual(applyVerifiedEventFacts(other), other);
    }
  }
});

test("the exact holiday fair keeps verified free admission without generalizing other museum events", () => {
  const source = row("inbound-c00ce46df40cb6ea"), fixed = applyVerifiedEventFacts(source);
  assert.equal(fixed.cost, "free"); assert.deepEqual(applyVerifiedEventFacts(fixed), fixed);
  for (const other of [{ ...source, date: "2027-11-21" }, { ...source, url: source.url + "1" }]) assert.deepEqual(applyVerifiedEventFacts(other), other);
});

test("clearing the disputed workshop clock preserves its published URL as a confirmation notice", () => {
  const source = row("inbound-8ae3d349571bf89b"), fixed = applyVerifiedEventFacts(source);
  const ledger = retireSlugs({ entries: [] }, [source], [fixed], "2026-11-09");
  const { redirects, orphans } = resolveRetired(ledger, [fixed], [], "2026-11-09");
  assert.equal(redirects.size, 0);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].slug, "2027-01-30-little-rams-leap-ink-painting-on-canvas-children");
  assert.equal(orphans[0].event.time, null);
  assert.equal(orphans[0].event.attendanceStatus, "needs-confirmation");
  assert.match(orphans[0].event.attendanceNote, /1–3 PM.*10 AM–noon Pacific/);
});
