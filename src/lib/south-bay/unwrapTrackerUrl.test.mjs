// Tests for isTrackerUrl / stripTrackingParams — the guard that keeps
// email-blast wrapper URLs off the public site.
//
// The stakes are not just dead links: several of these wrappers encode the
// recipient. On 2026-08-27 a Los Gatos Library cookbook-club listing shipped
// with a lgplca.patronpoint.com/r/ URL whose token base64-decodes to an
// `email` field and a 64-hex `contactHash` — a per-subscriber identifier,
// published on a public events page.

import test from "node:test";
import assert from "node:assert/strict";
import { isTrackerUrl, normalizeTrackerCache, publicEventSourceUrl, stripTrackingParams } from "./unwrapTrackerUrl.mjs";

test("flags PatronPoint library redirects (carry a per-subscriber contactHash)", () => {
  assert.equal(
    isTrackerUrl("https://lgplca.patronpoint.com/r/dfe41380f5a167a4cb048f92a/AAAAAhQGEQFzFAIGABEFZW1haWw"),
    true,
  );
});

test("flags Levi's Stadium / 49ers marketing sends", () => {
  assert.equal(
    isTrackerUrl("https://ls.49ers.com/MjIyLUJBTy04NDQAAAGhb0rvTiCHCsW4VL9Ai9s_2wt9wBae4tdGQgHdzUQoH"),
    true,
  );
});

test("still flags the previously-known wrappers", () => {
  assert.equal(isTrackerUrl("https://cc.rs6.net/tn.jsp?f=001abc"), true);
  assert.equal(isTrackerUrl("https://us7.list-manage.com/track/click?u=1&id=2"), true);
  assert.equal(isTrackerUrl("https://links-2.govdelivery.com/CL0/https%3A%2F%2Fexample.gov/1/010"), true);
});

test("flags Stanford Athletics Eloqua redirects", () => {
  assert.equal(
    isTrackerUrl(
      "https://app.mail.gostanford.com/e/er?s=1855418&lid=2442&elq=recipient-token",
    ),
    true,
  );
});

test("flags JAMsj newsletter click wrappers before publication", () => {
  assert.equal(
    isTrackerUrl("https://app.dvcomms.net/api/Communication/Click?prm=recipient-token&target=campaign-link"),
    true,
  );
});

test("leaves real event pages alone", () => {
  assert.equal(isTrackerUrl("https://levisstadium.com/event/chris-brown-usher-the-randb-tour/"), false);
  assert.equal(isTrackerUrl("https://www.mountainwinery.com/events/detail?event_id=1374384"), false);
  assert.equal(isTrackerUrl("https://sccl.bibliocommons.com/events/6a650543cf8dd42855ad7e51"), false);
  // The bare PatronPoint host is a real library site — only the /r/ redirect
  // path is a tracker.
  assert.equal(isTrackerUrl("https://lgplca.patronpoint.com/events"), false);
});

test("stripTrackingParams drops utm/click ids but keeps real query params", () => {
  assert.equal(
    stripTrackingParams("https://example.com/e?event_id=12&utm_source=news&fbclid=xyz"),
    "https://example.com/e?event_id=12",
  );
  assert.equal(
    stripTrackingParams("https://example.com/e?event_id=12"),
    "https://example.com/e?event_id=12",
  );
});

test("public event URLs keep ticket selectors and strip Eloqua subscriber parameters", () => {
  assert.equal(
    publicEventSourceUrl("https://tickets.gostanford.com/events/sample?slot=2&elqTrackId=campaign&elq=recipient&elqCampaignId=sample"),
    "https://tickets.gostanford.com/events/sample?slot=2",
  );
  assert.equal(publicEventSourceUrl("https://app.mail.gostanford.com/e/er?elq=recipient"), null);
});

test("the committed redirect cache migrates raw URLs without retaining subscriber tokens", () => {
  const resolved = "https://app.mail.gostanford.com/e/er?elq=recipient";
  const unresolved = "https://example.list-manage.com/track/click?e=recipient";
  const cache = normalizeTrackerCache({
    byUrl: {
      [resolved]: "https://tickets.gostanford.com/events/sample?elq=recipient",
      [unresolved]: unresolved,
    },
    generatedAt: "2026-11-25T13:12:35.539Z",
  });
  assert.equal(Object.keys(cache.byHash).length, 2);
  assert.ok(Object.keys(cache.byHash).every((key) => /^[a-f0-9]{64}$/.test(key)));
  assert.deepEqual(Object.values(cache.byHash), ["https://tickets.gostanford.com/events/sample", null]);
  assert.equal(cache.generatedAt, "2026-11-25T13:12:35.539Z");
  assert.doesNotMatch(JSON.stringify(cache), /recipient/);
  assert.deepEqual(normalizeTrackerCache(cache), cache);
});
