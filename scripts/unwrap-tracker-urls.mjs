#!/usr/bin/env node
/** Clean tracking URLs from local event data using the same rules as ingest. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/io.mjs";
import { publicInboundEventLinks } from "./lib/inbound-event-normalize.mjs";
import { isTrackerUrl, publicEventLinks, unwrapMany } from "../src/lib/south-bay/unwrapTrackerUrl.mjs";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "south-bay");

async function processEvents(name, urlField, toPublic) {
  const path = join(dataDir, `${name}.json`);
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!data?.events?.length) return;
  const wrappers = data.events.map((event) => event[urlField]).filter(isTrackerUrl);
  const resolved = wrappers.length ? await unwrapMany(wrappers, { verbose: true }) : new Map();
  const updated = data.events.map((event) => toPublic(event, resolved));
  const changed = updated.filter((event, index) => JSON.stringify(event) !== JSON.stringify(data.events[index])).length;
  if (changed) writeFileAtomic(path, JSON.stringify({ ...data, events: updated }, null, 2) + "\n");
  console.log(`${name}: cleaned ${changed} of ${updated.length} records`);
}

function publicCalendarEvent(event, resolved) {
  const url = resolved.get(event.url);
  return publicEventLinks(url ? { ...event, url } : event);
}

await processEvents("inbound-events", "sourceUrl", publicInboundEventLinks);
await processEvents("upcoming-events", "url", publicCalendarEvent);
await processEvents("events-archive", "url", publicCalendarEvent);
