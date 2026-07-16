import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlaceEditorialOverride,
  getPlaceEditorialOverride,
  isPlaceTemporarilyUnavailable,
} from "./placeAvailability.mjs";

const DE_SAISSET_ID = "ChIJUVuaM6zLj4ARoQSjNyb1ebQ";

test("de Saisset stays suppressed until a human verifies reopening", () => {
  assert.equal(isPlaceTemporarilyUnavailable(DE_SAISSET_ID), true);
  assert.equal(isPlaceTemporarilyUnavailable(`place:${DE_SAISSET_ID}`), true);
  assert.equal(isPlaceTemporarilyUnavailable({ venue: "de Saisset Museum" }), true);
  assert.equal(isPlaceTemporarilyUnavailable({
    name: "A museum exhibition",
    url: "https://events.scu.edu/de-saisset/event/1234-example",
  }), true);
  assert.equal(getPlaceEditorialOverride(DE_SAISSET_ID).reviewOn, "2026-09-01");
});

test("editorial override restores the venue's canonical name and URL", () => {
  assert.deepEqual(
    applyPlaceEditorialOverride({ id: DE_SAISSET_ID, name: "De Saisset Museum", url: "http://www.scu.edu/deSaisset/" }),
    { id: DE_SAISSET_ID, name: "de Saisset Museum", url: "https://www.scu.edu/desaisset/" },
  );
});

test("unlisted places pass through unchanged", () => {
  const place = { id: "another-place", name: "Another Place" };
  assert.equal(applyPlaceEditorialOverride(place), place);
  assert.equal(isPlaceTemporarilyUnavailable(place), false);
});
