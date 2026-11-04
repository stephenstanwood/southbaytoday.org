import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchScclEvents, polishDescription } from "../generate-events.mjs";
import { applyVerifiedEventFacts } from "../../src/lib/south-bay/eventSourceFacts.mjs";
import { polishReviewedEventCopy } from "../../src/lib/south-bay/eventCopyEdits.mjs";
import { resolveEventBlurbs } from "../../src/lib/south-bay/eventBlurbs.mjs";

const fixture = JSON.parse(readFileSync(new URL("../lib/fixtures/sccl-origami-contact-2026-11-19.json", import.meta.url)));
const expectedDescription = fixture.publishedBefore.description.replace("(408) 540-3947 7", "(408) 540-3947");

test("the captured SCCLD source survives repeated imports with only its verified phone repaired", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(fixture.retrievedAt) });
  const original = structuredClone(fixture);
  t.mock.method(globalThis, "fetch", async url => {
    const request = new URL(url);
    assert.equal(request.origin, "https://gateway.bibliocommons.com");
    assert.equal(request.pathname, "/v2/libraries/sccl/events");
    return Response.json({ entities: {
      ...fixture.entities,
      events: request.searchParams.get("page") === "1" ? { [fixture.event.id]: fixture.event } : {},
    } });
  });
  assert.match(fixture.event.definition.description, /\(408\) 540-3947<\/a>7,/);
  for (let pass = 0; pass < 3; pass++) {
    const [imported] = await fetchScclEvents();
    assert.equal(imported.id, fixture.publishedBefore.id);
    assert.equal(imported.date, "2026-11-19");
    assert.equal(imported.time, "4:00 PM");
    assert.equal(imported.endTime, "4:45 PM");
    assert.equal(imported.venue, "Cupertino Library");
    assert.equal(imported.cost, "free");
    assert.deepEqual(imported.sourceAudiences, ["Kids: Grades K-8"]);
    assert.match(imported.description, /No registration required/);
    const normalized = { ...imported, description: polishDescription(imported.description) };
    const corrected = applyVerifiedEventFacts(normalized);
    assert.deepEqual(corrected, {
      ...normalized,
      description: normalized.description.replace("(408) 540-3947 7", "(408) 540-3947"),
    }, "every other field and all surrounding prose remain unchanged");
    const rows = [corrected];
    await resolveEventBlurbs(rows, { enabled: false });
    const published = polishReviewedEventCopy(rows[0]);
    assert.equal(published.description, expectedDescription);
    assert.deepEqual(applyVerifiedEventFacts(published), published);
  }
  assert.deepEqual(fixture, original, "captured publisher evidence remains immutable");
});

test("the retained event changes exactly one malformed contact token", () => {
  const event = fixture.publishedBefore;
  const corrected = applyVerifiedEventFacts(event);
  assert.deepEqual(corrected, { ...event, description: expectedDescription });
  assert.deepEqual(applyVerifiedEventFacts(corrected), corrected);
});

test("raw, normalized and cached contact spellings are repaired for the exact occurrence", async () => {
  for (const token of ["(408) 540-39477", "(408) 540-3947 7"]) {
    for (const url of [fixture.sourceUrl, fixture.sourceUrl.replace("/events/", "/v2/events/")]) {
      const description = fixture.publishedBefore.description.replace("(408) 540-3947 7", token);
      const event = { ...fixture.publishedBefore, url, description,
        blurb: `For accessibility assistance, call ${token}, or email us at ask@lib.sccgov.org.` };
      const expected = { ...event, description: expectedDescription,
        blurb: "For accessibility assistance, call (408) 540-3947, or email us at ask@lib.sccgov.org." };
      const rows = [structuredClone(event)];
      await resolveEventBlurbs(rows, { enabled: false });
      assert.deepEqual(rows[0], expected);
    }
  }
});

test("the correction preserves later contacts, extensions and unrelated occurrences", () => {
  const event = fixture.publishedBefore;
  for (const token of ["(408) 540-3947", "(408) 555-0199", "(408) 540-3947 ext. 7", "(408) 540-3947 77"]) {
    const revised = { ...event, description: event.description.replace("(408) 540-3947 7", token) };
    assert.deepEqual(applyVerifiedEventFacts(revised), revised);
  }
  for (const other of [
    { ...event, date: "2026-11-20" },
    { ...event, url: "https://sccl.bibliocommons.com/events/another-origami-event" },
    { ...event, url: "https://example.org/events/6ae2292c0b801373af915568" },
  ]) assert.deepEqual(applyVerifiedEventFacts(other), other);
  const suffix = " Registration required. Ages 12+; $25. Contact updated@example.org.";
  const revised = { ...event, description: event.description + suffix };
  assert.deepEqual(applyVerifiedEventFacts(revised), { ...revised, description: expectedDescription + suffix });
});
