#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { todayPT } from "../lib/dates.mjs";
import { writeFileAtomic } from "../lib/io.mjs";
import { mergeLosGatosSummerConcerts } from "../lib/los-gatos-summer-concerts-2026.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "src", "data", "south-bay");
const UPCOMING_PATH = join(DATA_DIR, "upcoming-events.json");
const ARCHIVE_PATH = join(DATA_DIR, "events-archive.json");
const FIRST_SEEN_PATH = join(DATA_DIR, "event-first-seen-cache.json");

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00-07:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const today = todayPT();
const now = new Date().toISOString();

const upcoming = JSON.parse(readFileSync(UPCOMING_PATH, "utf8"));
const upcomingMerge = mergeLosGatosSummerConcerts(upcoming.events, {
  fromDate: today,
});

const firstSeen = JSON.parse(readFileSync(FIRST_SEEN_PATH, "utf8"));
firstSeen.byId ||= {};
for (const event of upcomingMerge.events) {
  if (!upcomingMerge.canonicalEvents.some((candidate) => candidate.id === event.id)) continue;
  event.firstSeenAt ||= now;
  firstSeen.byId[event.id] = event.firstSeenAt;
}
firstSeen.generatedAt = now;

upcoming.events = upcomingMerge.events;
upcoming.eventCount = upcoming.events.length;
upcoming.sources ||= [];
for (const event of upcomingMerge.canonicalEvents) {
  if (!upcoming.sources.includes(event.source)) upcoming.sources.push(event.source);
}

const archive = JSON.parse(readFileSync(ARCHIVE_PATH, "utf8"));
const archiveMerge = mergeLosGatosSummerConcerts(archive.events, {
  fromDate: shiftDate(today, -30),
  throughDate: shiftDate(today, -1),
});
for (const event of archiveMerge.events) {
  if (!event.firstSeenAt && archiveMerge.canonicalEvents.some((candidate) => candidate.id === event.id)) {
    event.firstSeenAt = now;
  }
}
archive.events = archiveMerge.events;
archive.eventCount = archive.events.length;
archive.updatedAt = now;

writeFileAtomic(UPCOMING_PATH, `${JSON.stringify(upcoming, null, 2)}\n`);
writeFileAtomic(ARCHIVE_PATH, `${JSON.stringify(archive, null, 2)}\n`);
writeFileAtomic(FIRST_SEEN_PATH, `${JSON.stringify(firstSeen, null, 2)}\n`);

console.log(
  `upcoming: ${upcomingMerge.canonicalEvents.length} canonical concert(s); `
    + `${upcomingMerge.replacedCount} source row(s) replaced; ${upcomingMerge.addedCount} added`,
);
console.log(
  `archive: ${archiveMerge.canonicalEvents.length} canonical concert(s); `
    + `${archiveMerge.replacedCount} source row(s) replaced; ${archiveMerge.addedCount} added`,
);
