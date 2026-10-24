import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runScraper } from "../playwright-scrapers.mjs";

function fixture() {
  const frame = {};
  const listeners = new Map();
  const page = {
    closed: false,
    on: (name, listener) => listeners.set(name, listener),
    mainFrame: () => frame,
    close: async () => { page.closed = true; },
    response(status, { navigation = true, mainFrame = true } = {}) {
      listeners.get("response")?.({
        status: () => status,
        url: () => "https://example.test/store/1944?token=private-fixture",
        request: () => ({ isNavigationRequest: () => navigation }),
        frame: () => mainFrame ? frame : {},
      });
    },
  };
  return { page, browser: { newPage: async () => page } };
}

for (const status of [401, 403, 429]) {
  test(`HTTP ${status} remains an access error when an adapter silently returns zero`, async () => {
    const { browser, page } = fixture();
    const result = await runScraper(browser, "Bookstore", async (p) => {
      p.response(status);
      return [];
    });
    assert.deepEqual(result.events, []);
    assert.match(result.error, new RegExp(`HTTP ${status}`));
    assert.match(result.error, /https:\/\/example.test\/store\/1944/);
    assert.doesNotMatch(result.error, /token|private-fixture/);
    assert.equal(page.closed, true);
  });
}

test("a refused store is still recorded when another store contributes dated events", async () => {
  const { browser, page } = fixture();
  const events = [{ source: "Bookstore", date: "2026-11-01" }];
  const result = await runScraper(browser, "Bookstore", async (p) => {
    p.response(403);
    return events;
  });
  assert.equal(result.events, events);
  assert.match(result.error, /HTTP 403/);
  assert.equal(page.closed, true);
});

test("an allowed empty calendar and unrelated resource refusals remain empty results", async () => {
  const { browser, page } = fixture();
  const result = await runScraper(browser, "Calendar", async (p) => {
    p.response(200);
    p.response(403, { navigation: false });
    p.response(403, { mainFrame: false });
    return [];
  });
  assert.deepEqual(result, { events: [], error: null });
  assert.equal(page.closed, true);
});

test("the scraper's own specific failure remains authoritative", async () => {
  const { browser, page } = fixture();
  const result = await runScraper(browser, "Museum", async (p) => {
    p.response(403);
    throw new Error("SJMA calendar returned HTTP 403");
  });
  assert.equal(result.error, "SJMA calendar returned HTTP 403");
  assert.equal(page.closed, true);
});

test("the excluded Palo Alto Art Center collector cannot be requested", () => {
  const source = readFileSync(new URL("../playwright-scrapers.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /scrapePaloAltoArtCenter/);
  assert.doesNotMatch(source, /cityofpaloalto\.org\/Departments\/[^"\n]*Palo-Alto-Art-Center/);
});
