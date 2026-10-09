import test from "node:test";
import assert from "node:assert/strict";

import { parseScpIntro, scpShowPageUrl } from "../generate-events.mjs";

const SITE_HTML = `
  <a href="https://www.sunnyvaleplayers.org/aliceinwonderland/">Alice</a>
  <a href="https://www.sunnyvaleplayers.org/rent/">Rent</a>
  <a href="https://www.sunnyvaleplayers.org/descendantsthemusical/">Descendants</a>
  <a href="https://www.sunnyvaleplayers.org/season-calendar/">Season Calendar</a>`;

test("SCP show titles map to their own show pages", () => {
  assert.equal(scpShowPageUrl("Alice in Wonderland", SITE_HTML), "https://www.sunnyvaleplayers.org/aliceinwonderland/");
  assert.equal(scpShowPageUrl("Rent", SITE_HTML), "https://www.sunnyvaleplayers.org/rent/");
  assert.equal(
    scpShowPageUrl("Disney's Descendants: The Musical", SITE_HTML),
    "https://www.sunnyvaleplayers.org/descendantsthemusical/",
  );
});

test("SCP show pages need an exact or long-tail match", () => {
  // "/rent/" must not claim a different show that merely ends in "rent".
  assert.equal(scpShowPageUrl("The Parent Trap", SITE_HTML), null);
  assert.equal(scpShowPageUrl("Mean Girls", SITE_HTML), null);
});

test("SCP intro leads with the synopsis and keeps rating out of the copy", () => {
  const intro = parseScpIntro(
    "Jr. Production- Disney's Descendants: The Musical Approximate Running Time: 2 hour and 30 minutes (including intermission) Rating: G Imprisoned on the Isle of the Lost, the teenage children of villains have never left.",
    "Disney's Descendants: The Musical",
  );
  assert.equal(intro.production, "Jr. Production");
  assert.equal(intro.rating, "G");
  assert.equal(
    intro.description,
    "Imprisoned on the Isle of the Lost, the teenage children of villains have never left. Running time: about 2 hours and 30 minutes (including intermission).",
  );
});

test("SCP intro without a runtime or rating passes the synopsis through", () => {
  const intro = parseScpIntro("Main Stage Production- Rent Set in the East Village.", "Rent");
  assert.deepEqual(intro, { description: "Set in the East Village.", rating: "", production: "Main Stage Production" });
});
