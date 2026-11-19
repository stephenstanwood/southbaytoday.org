import assert from "node:assert/strict";
import test from "node:test";

process.env.SBT_STRICT_EVENT_REFRESH = "1";
const { fetchHappyHollowEvents } = await import("../generate-events.mjs");

const seniorSafariUrl = "https://happyhollow.org/seniorsafari/";
const hoorayUrl = "https://happyhollow.org/hh-foundation/hooray/";

test("Happy Hollow spaces retries and program requests by the published crawl delay", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-19T14:43:22Z") });
  const actions = [];
  let safariAttempts = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    actions.push(url);
    if (url === seniorSafariUrl) {
      safariAttempts++;
      if (safariAttempts === 1) throw new DOMException("Timed out", "TimeoutError");
      return new Response("<p>The 2026 season is here! Join us the fourth Thursday of the month from May through October from 9-10 a.m.</p>");
    }
    assert.equal(url, hoorayUrl);
    return new Response("<p>The Hooray for Happy Hollow benefit event is Saturday, Sept. 12, 2026.</p>");
  });

  const events = await fetchHappyHollowEvents({ wait: async (ms) => { actions.push(ms); } });

  assert.deepEqual(actions, [seniorSafariUrl, 10_000, seniorSafariUrl, 10_000, hoorayUrl]);
  assert.deepEqual(events, [], "both dated programs have ended for the season");
});

test("Happy Hollow surfaces an access refusal without retrying or reading the other program", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    return new Response(null, { status: 403 });
  });

  await assert.rejects(fetchHappyHollowEvents({ wait: async () => {} }), /^Error: 403$/);
  assert.deepEqual(requests, [seniorSafariUrl]);
});
