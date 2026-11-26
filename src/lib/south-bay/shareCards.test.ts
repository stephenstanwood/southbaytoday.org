import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { CITY_SHARE_CARD_IDS, SITE_SHARE_CARD, cityShareCard } from "./shareCards";

test("every city share card and the site card exist in public/", () => {
  for (const id of CITY_SHARE_CARD_IDS) {
    assert.ok(existsSync(new URL(`../../../public/og/og-city-${id}.jpg`, import.meta.url)), id);
  }
  assert.ok(existsSync(new URL("../../../public/images/og-image.png", import.meta.url)));
  assert.equal(SITE_SHARE_CARD, "https://southbaytoday.org/images/og-image.png");
});

test("a city without a card gets none, so callers fall back to the site card", () => {
  assert.equal(cityShareCard("campbell"), "https://southbaytoday.org/og/og-city-campbell.jpg");
  assert.equal(cityShareCard("santa-cruz"), null);
  assert.equal(cityShareCard(null), null);
  assert.equal(cityShareCard(undefined), null);
});
