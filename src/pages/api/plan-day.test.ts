// Minimal test harness for plan-day's pure helpers + bucket logic.
// Run: npm run test:plan-day

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseHour, fallbackBlurb } from "./plan-day.ts";
import { cleanDisplayCopy, cleanDisplayName } from "../../lib/south-bay/displayText.mjs";
import {
  bucketForHour,
  bucketForEvent,
  bucketOrderIndex,
  isBucket,
  BUCKET_ORDER,
} from "../../lib/south-bay/buckets.ts";

test("parseHour: AM/PM", () => {
  assert.equal(parseHour("9:00 AM"), 9);
  assert.equal(parseHour("12:00 AM"), 0);
  assert.equal(parseHour("12:00 PM"), 12);
  assert.equal(parseHour("7:30 PM"), 19);
  assert.equal(parseHour("11:45 PM"), 23);
});

test("parseHour: 24h", () => {
  assert.equal(parseHour("09:00"), 9);
  assert.equal(parseHour("23:15"), 23);
});

test("parseHour: unparseable", () => {
  assert.equal(parseHour("TBD"), null);
  assert.equal(parseHour("all day"), null);
  assert.equal(parseHour(""), null);
});

test("bucketForHour: activity slots", () => {
  assert.equal(bucketForHour(8), "morning");
  assert.equal(bucketForHour(11), "morning");
  assert.equal(bucketForHour(14), "afternoon");
  assert.equal(bucketForHour(18), "evening");
  assert.equal(bucketForHour(22), "evening");
});

test("bucketForHour: meal slots", () => {
  assert.equal(bucketForHour(8, "meal"), "breakfast");
  assert.equal(bucketForHour(12, "meal"), "lunch");
  assert.equal(bucketForHour(19, "meal"), "dinner");
});

test("bucketForEvent: 7 PM food event → dinner", () => {
  assert.equal(bucketForEvent("7:00 PM", "food"), "dinner");
});

test("bucketForEvent: 7 PM concert → evening", () => {
  assert.equal(bucketForEvent("7:00 PM", "music"), "evening");
});

test("bucketForEvent: 11 AM workshop → morning", () => {
  assert.equal(bucketForEvent("11:00 AM", "events"), "morning");
});

test("bucketForEvent: unparseable time → null", () => {
  assert.equal(bucketForEvent("TBD", "food"), null);
  assert.equal(bucketForEvent(null, "food"), null);
});

test("bucketOrderIndex: canonical order", () => {
  for (let i = 0; i < BUCKET_ORDER.length; i++) {
    assert.equal(bucketOrderIndex(BUCKET_ORDER[i]), i);
  }
});

test("isBucket: validates", () => {
  assert.equal(isBucket("breakfast"), true);
  assert.equal(isBucket("morning"), true);
  assert.equal(isBucket("evening"), true);
  assert.equal(isBucket("midnight"), false);
  assert.equal(isBucket(""), false);
  assert.equal(isBucket(null), false);
});

test("fallbackBlurb: deterministic per-name", () => {
  const a1 = fallbackBlurb("event", "food", "Taco Festival", null);
  const a2 = fallbackBlurb("event", "food", "Taco Festival", null);
  assert.equal(a1, a2, "same name → same blurb every render");
});

test("fallbackBlurb: different names can differ", () => {
  const names = ["A", "B", "C", "D", "E", "F", "G"].map((n) =>
    fallbackBlurb("event", "music", `Show ${n}`, null),
  );
  assert.ok(new Set(names).size >= 2, "deterministic but varied");
});

test("fallbackBlurb: unknown category falls to events pool", () => {
  const out = fallbackBlurb("event", "space-travel-jamboree", "Rocket Night", null);
  assert.ok(out.length > 0);
  assert.ok(!out.includes("swing by"), "never the 'swing by X' anti-pattern");
});

test("fallbackBlurb: place + known category", () => {
  const out = fallbackBlurb("place", "food", "Luna Mexican Kitchen", null);
  assert.ok(out.length > 0);
  assert.ok(!out.startsWith("Quick stop"), "specific category should not hit last-ditch");
});

test("fallbackBlurb: truly unknown source/category → last ditch", () => {
  const out = fallbackBlurb("place", "__missing__", "Test Place", null);
  assert.ok(out.length > 0);
});

test("display cleanup: strips CJK/Hangul translation fragments from names", () => {
  assert.equal(cleanDisplayName("世界生活館 Amazing Books & Gifts"), "Amazing Books & Gifts");
  assert.equal(cleanDisplayName("Paik's Noodle / 홍콩반점 산호세"), "Paik's Noodle");
  assert.equal(cleanDisplayName("Sizzling Pot House (鼎香砂锅馆)"), "Sizzling Pot House");
});

test("display cleanup: capitalizes proper adjectives in blurbs", () => {
  assert.equal(
    cleanDisplayCopy("Cupertino taiwanese restaurant on Stevens Creek Blvd, $$ sit-down."),
    "Cupertino Taiwanese restaurant on Stevens Creek Blvd, $$ sit-down.",
  );
  assert.equal(
    cleanDisplayCopy("More at https://example.com/taiwanese-food before taiwanese lunch."),
    "More at https://example.com/taiwanese-food before Taiwanese lunch.",
  );
});
