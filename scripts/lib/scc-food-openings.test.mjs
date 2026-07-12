import assert from "node:assert/strict";
import test from "node:test";

import { isAddressDerivedBusinessName } from "./scc-food-openings.mjs";

test("rejects the two SCC records whose deduped prefix recreated Great American P", () => {
  const siteLocation = "4988 GREAT AMERICAN PY., SANTA CLARA, CA 95054";

  assert.equal(
    isAddressDerivedBusinessName("E-4988 GREAT AMERICAN P CAFE", siteLocation),
    true,
  );
  assert.equal(
    isAddressDerivedBusinessName("E-4988 GREAT AMERICAN P COFFEE BAR", siteLocation),
    true,
  );
});

test("rejects both full and truncated address-only display names", () => {
  assert.equal(
    isAddressDerivedBusinessName("14612 Big Basin Wy", "14612 BIG BASIN WY., SARATOGA, CA"),
    true,
  );
  assert.equal(
    isAddressDerivedBusinessName("4988 Great American P", "4988 Great American Pkwy"),
    true,
  );
});

test("keeps numeric restaurant brands that do not encode their site address", () => {
  assert.equal(
    isAddressDerivedBusinessName("7 Leaves Cafe", "7 Leaves Ln, San Jose, CA"),
    false,
  );
  assert.equal(
    isAddressDerivedBusinessName("99 Ranch Market", "925 Blossom Hill Rd, San Jose, CA"),
    false,
  );
  assert.equal(
    isAddressDerivedBusinessName("10 Butchers Korean BBQ", "10 E Hamilton Ave, Campbell, CA"),
    false,
  );
});
