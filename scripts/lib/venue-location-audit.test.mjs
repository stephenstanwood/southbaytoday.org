import assert from "node:assert/strict";
import test from "node:test";

import { auditEventLocation, auditEventLocations } from "./venue-location-audit.mjs";
import { classify } from "../audit-events.mjs";

test("a Stanford biography cannot excuse an out-of-area destination in the event audit", () => {
  const event = {
    title: "Coral Bleaching Recovery with the Help of Healthy Corals",
    city: "palo-alto", venue: "Hopkins Marine Station",
    address: "120 Ocean View Blvd Pacific Grove, CA 93950",
    description: "Danny Collins is a third-year PhD student in Stanford University's Oceans Department.",
  };
  assert.ok(classify(event).some((f) => f.reason === "out-of-area" && f.severity === "hard"));
  const trip = classify({ ...event, title: "Field Trip to Hopkins Marine Station" });
  assert.ok(trip.some((f) => f.reason === "local-departure-trip" && f.severity === "info"));
  assert.ok(!trip.some((f) => f.reason === "out-of-area"));
});

test("a biography's Pacific Grove affiliation cannot move a local event out of area", () => {
  const findings = classify({
    title: "Coral Research Talk", city: "palo-alto",
    venue: "Stanford University", address: "Stanford, CA 94305",
    description: "Our guest works at Hopkins Marine Station in Pacific Grove.",
  });
  assert.ok(!findings.some((f) => f.reason === "out-of-area"));
});

// ── the 2026-09-03 records ─────────────────────────────────────────────────

test("a title announcing a move must not ship the listing institution as venue", () => {
  const finding = auditEventLocation({
    title: "LOCATION CHANGE: Line Dancing with Sandy and Kent",
    venue: "Palo Alto City Library",
    source: "Palo Alto City Library",
    address: "",
  });
  assert.equal(finding?.level, "block");
  assert.equal(finding.rule, "location-change-names-source");
});

test("the pipeline's title-cased form is caught too", () => {
  // upcoming-events.json stores "Location Change: Meditation with Sara".
  const finding = auditEventLocation({
    title: "Location Change: Meditation with Sara",
    venue: "Palo Alto City Library",
    source: "Palo Alto City Library",
  });
  assert.equal(finding?.level, "block");
});

test("a move announced only in the body is caught", () => {
  const finding = auditEventLocation({
    title: "Line Dancing with Sandy and Kent",
    description:
      "<p><strong>**The September 3 line dancing class has moved indoors to the "
      + "Mitchell Park Community Center (El Palo Alto Room) due to the possibility of rain.**</strong></p>",
    venue: "Palo Alto City Library",
    source: "Palo Alto City Library",
  });
  assert.equal(finding?.level, "block");
});

test("the same record is fine once it names the real venue", () => {
  const finding = auditEventLocation({
    title: "LOCATION CHANGE: Line Dancing with Sandy and Kent",
    description: "The class has moved indoors to the Mitchell Park Community Center.",
    venue: "Mitchell Park Community Center (El Palo Alto Room)",
    source: "Palo Alto City Library",
    address: "3700 Middlefield Road Palo Alto",
  });
  assert.equal(finding, null);
});

test("an off-site LibCal event that resolved correctly is clean", () => {
  assert.equal(
    auditEventLocation({
      title: "Cuesta Park Storytime",
      venue: "Cuesta Park",
      source: "Mountain View Public Library",
      address: "615 Cuesta Dr, Mountain View, CA 94040",
    }),
    null,
  );
});

// ── the rule must not fire on ordinary programs ────────────────────────────

test("a library program at its own library does not block", () => {
  const finding = auditEventLocation({
    title: "Evergreen Book Club",
    description: "Join us for a discussion of this month's pick.",
    venue: "San Jose Public Library",
    source: "San Jose Public Library",
    address: "",
  });
  assert.equal(finding?.level, "warn", "reported, but never blocking");
});

test("prose that merely contains the word moved does not block", () => {
  for (const description of [
    "The class moved quickly through the basic steps.",
    "This exhibit moved audiences to tears.",
    "Attendees moved between stations.",
  ]) {
    const finding = auditEventLocation({
      title: "Line Dancing",
      description,
      venue: "Palo Alto City Library",
      source: "Palo Alto City Library",
      address: "",
    });
    assert.notEqual(finding?.level, "block", `must not block on: ${description}`);
  }
});

test("a branch venue that differs from the source is not warned about", () => {
  assert.equal(
    auditEventLocation({
      title: "Family Storytime",
      venue: "Mitchell Park Library",
      source: "Palo Alto City Library",
      address: "3700 Middlefield Rd Palo Alto",
    }),
    null,
  );
});

test("a move announcement is not blocked when the venue is already a real place", () => {
  assert.equal(
    auditEventLocation({
      title: "MOVED: Meditation with Sara",
      venue: "Art Center Meeting Room",
      source: "Palo Alto City Library",
      address: "1313 Newell Road Palo Alto",
    }),
    null,
  );
});

test("malformed records are ignored rather than throwing", () => {
  for (const bad of [null, undefined, "nope", 42, {}]) {
    assert.doesNotThrow(() => auditEventLocation(bad));
  }
  assert.deepEqual(auditEventLocations(null), { problems: [], warnings: [], blocked: 0, warned: 0 });
});

test("auditEventLocations separates blocking problems from warnings", () => {
  const result = auditEventLocations([
    { title: "LOCATION CHANGE: A", venue: "X Library", source: "X Library" },
    { title: "B", venue: "X Library", source: "X Library", address: "" },
    { title: "C", venue: "Some Park", source: "X Library", address: "1 Main St" },
  ]);
  assert.equal(result.blocked, 1);
  assert.equal(result.warned, 1);
});
