import { readFileSync } from "node:fs";
import { ARTIFACTS } from "./paths.mjs";

export const OFFICIAL_SNAPSHOT_SOURCES = Object.freeze({
  fetchLosAltosHistoryEvents: {
    label: "Los Altos History Museum",
    url: "https://www.losaltoshistory.org/events/?ical=1",
  },
  fetchSjJazzEvents: {
    label: "San Jose Jazz",
    url: "https://summerfest.sanjosejazz.org/lineup",
  },
});

/** Empty seasons are valid only after the live adapters successfully parse. */
export function inspectOfficialEventSnapshot(data, { now = new Date(), maxAgeHours = 30 } = {}) {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error("invalid official snapshot maximum age");
  const fail = (reason) => { throw new Error(`official event snapshot: ${reason}`); };
  if (data?.version !== 1) fail("missing or unsupported format");
  let oldestAge = 0;
  const checkStamp = (label, stamp) => {
    const age = (now.getTime() - Date.parse(stamp)) / 3_600_000;
    if (!Number.isFinite(age)) fail(`${label} has no valid timestamp`);
    if (age < -1) fail(`${label} timestamp is in the future`);
    if (age > maxAgeHours) fail(`${label} is stale (${age.toFixed(1)}h; maximum ${maxAgeHours}h)`);
    oldestAge = Math.max(oldestAge, age);
  };
  checkStamp("generatedAt", data.generatedAt);
  let count = 0;
  for (const [id, definition] of Object.entries(OFFICIAL_SNAPSHOT_SOURCES)) {
    const source = data.sources?.[id];
    if (source?.status !== "ok" || source.sourceUrl !== definition.url || !Array.isArray(source.events)) {
      fail(`${id} has no verified source result`);
    }
    checkStamp(id, source.observedAt);
    if (source.events.some((event) => !event?.id || !event.title || event.source !== definition.label
      || !/^20\d{2}-\d{2}-\d{2}$/.test(event.date || "") || !/^https:\/\//.test(event.url || ""))) {
      fail(`${id} contains malformed events`);
    }
    count += source.events.length;
  }
  return {
    name: "official-event-sources", status: "ok", count,
    timestamp: new Date(now.getTime() - oldestAge * 3_600_000).toISOString(),
    ageHours: Number(oldestAge.toFixed(2)), reason: null,
  };
}

export function readOfficialEventSnapshot(options = {}) {
  const data = JSON.parse(readFileSync(options.path || ARTIFACTS.officialEventSources, "utf8"));
  const health = inspectOfficialEventSnapshot(data, options);
  return { data, health };
}

export function officialSnapshotEvents(id, options = {}) {
  const { data } = readOfficialEventSnapshot(options);
  const today = (options.now || new Date()).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  return data.sources[id].events.filter((event) => event.date >= today);
}
