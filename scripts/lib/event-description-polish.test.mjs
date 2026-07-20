import assert from "node:assert/strict";
import test from "node:test";

import { polishDescription } from "../generate-events.mjs";

test("preserves the official BentPeter performer spelling", () => {
  assert.equal(
    polishDescription("Free outdoor concert featuring The BentPeter Band."),
    "Free outdoor concert featuring The BentPeter Band.",
  );
});
