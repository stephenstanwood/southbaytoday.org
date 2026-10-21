import assert from "node:assert/strict";
import test from "node:test";
import { classify } from "../audit-events.mjs";

test("regional Santa Cruz events pass geography while mislabeled campus events fail", () => {
  const event = {
    title: "Public workshop", city: "santa-cruz", venue: "Villa Maria Del Mar",
    address: "21918 E Cliff Dr, Santa Cruz, CA 95062",
  };
  assert.deepEqual(classify(event), []);
  assert.ok(classify({ ...event, city: "santa-clara" }).some((finding) => finding.reason === "slug-mismatch"));
  assert.ok(classify({ ...event, city: "santa-clara" }).some((finding) => finding.reason === "out-of-area"));
  assert.ok(classify({ ...event, address: "Main Street, Oakland, CA" }).some((finding) => finding.reason === "out-of-area"));
});

test("Campbell Recital Hall uses the shared Stanford landmark evidence", () => {
  const event = { title: "Zozulka Trio", venue: "Campbell Recital Hall, Braun Music Center", city: "palo-alto" };
  assert.deepEqual(classify(event), []);
  assert.ok(classify({ ...event, city: "campbell" }).some((finding) => finding.reason === "slug-mismatch"));
  assert.deepEqual(classify({ ...event, venue: "Campbell Community Center", city: "campbell" }), []);
});
