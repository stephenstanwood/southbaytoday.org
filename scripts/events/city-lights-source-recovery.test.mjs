import assert from "node:assert/strict";
import test from "node:test";
import { collectPlaywrightSourceResults, runScraper, scrapeCityLights } from "../playwright-scrapers.mjs";

const shows = ["first", "second", "third"].map(name => ({
  title: `${name} show`, link: `https://cltc.org/event/${name}/`,
}));
const tasks = [{ name: "City Lights Theater" }];
const previous = {
  _meta: { sourceHealth: [{ id: "city-lights-theater", sources: ["City Lights Theater"] }] },
  events: shows.map((show, index) => ({
    id: `previous-${index}`, title: show.title, url: show.link,
    date: "2099-04-11", time: "2:00 PM", source: "City Lights Theater",
  })).concat({ id: "past", date: "2001-04-11", source: "City Lights Theater" }),
};

function browserWith({ failedIndex = -1, status = 200, timeout = false, pastIndex = -1, indexStatus = 200 } = {}) {
  const state = { visited: [], pauses: 0, closed: false };
  let current;
  const page = {
    on() {},
    async goto(url) {
      current = url;
      state.visited.push(url);
      if (url === shows[failedIndex]?.link) {
        if (timeout) throw new Error("page.goto timed out");
        return { status: () => status };
      }
      return { status: () => url === "https://cltc.org/" ? indexStatus : 200 };
    },
    async evaluate() {
      if (current === "https://cltc.org/") return shows;
      return { startDate: current === shows[pastIndex]?.link ? "April 11, 2001" : "April 11, 2099" };
    },
    async waitForTimeout() { state.pauses++; },
    async close() { state.closed = true; },
  };
  return { browser: { async newPage() { return page; } }, state };
}

test("a timeout or HTTP failure after partial City Lights success reaches bounded source retention", async () => {
  for (const failure of [{ timeout: true }, { status: 500 }, { status: 401 }, { status: 403 }, { status: 429 }]) {
    const { browser, state } = browserWith({ failedIndex: 1, ...failure });
    const result = await runScraper(browser, tasks[0].name, scrapeCityLights);
    assert.match(result.error, /City Lights show-page collection incomplete/);
    assert.match(result.error, /https:\/\/cltc.org\/event\/second\//);
    assert.deepEqual(result.events, [], "an incomplete collection cannot claim fresh coverage");
    const denied = [401, 403, 429].includes(failure.status);
    assert.equal(state.visited.length, denied ? 3 : 4,
      "access refusals stop collection; transient failures allow a bounded attempt at other pages");
    assert.equal(state.pauses, denied ? 2 : 3);
    assert.equal(state.closed, true);
    const { events, sourceHealth: [health] } = collectPlaywrightSourceResults({
      tasks, results: [result], previous, today: "2099-01-01",
    });
    assert.deepEqual(events, previous.events.slice(0, 3));
    assert.equal(health.status, "error");
    assert.equal(health.liveCount, 0);
    assert.equal(health.retainedCount, 3);
    assert.equal(health.carriedForward, true);
  }
});

test("an explicit removal or elapsed show does not trigger retention", async () => {
  for (const status of [404, 410]) {
    const { browser, state } = browserWith({ failedIndex: 1, status, pastIndex: 2 });
    const result = await runScraper(browser, tasks[0].name, scrapeCityLights);
    assert.equal(result.error, null);
    assert.deepEqual(result.events.map(event => event.title), [shows[0].title]);
    assert.equal(state.pauses, 3);
    const { events, sourceHealth: [health] } = collectPlaywrightSourceResults({
      tasks, results: [result], previous, today: "2099-01-01",
    });
    assert.equal(events.length, 1);
    assert.equal(health.status, "ok");
    assert.equal(health.carriedForward, undefined);
  }
});

test("a healthy collection publishes all shows without carry-forward", async () => {
  const { browser } = browserWith();
  const result = await runScraper(browser, tasks[0].name, scrapeCityLights);
  assert.equal(result.error, null);
  assert.deepEqual(result.events.map(event => event.title), shows.map(show => show.title));
  const { events, sourceHealth: [health] } = collectPlaywrightSourceResults({
    tasks, results: [result], previous, today: "2099-01-01",
  });
  assert.equal(events.length, 3);
  assert.equal(health.liveCount, 3);
  assert.equal(health.carriedForward, undefined);
});

test("an HTTP failure at the City Lights index is a source error", async () => {
  const { browser, state } = browserWith({ indexStatus: 503 });
  const result = await runScraper(browser, tasks[0].name, scrapeCityLights);
  assert.match(result.error, /City Lights index returned HTTP 503/);
  assert.deepEqual(result.events, []);
  assert.equal(state.visited.length, 1);
  assert.equal(state.closed, true);
});
