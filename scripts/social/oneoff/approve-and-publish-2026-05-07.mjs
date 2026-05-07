#!/usr/bin/env node
// One-off: mark today's regen'd day-plan slot as approved (copy + image)
// then publish via the normal pipeline. Stephen approved in chat.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE_FILE = join(__dirname, "..", "..", "..", "src", "data", "south-bay", "social-schedule.json");

const sched = JSON.parse(readFileSync(SCHEDULE_FILE, "utf8"));
const slot = sched.days["2026-05-07"]?.["day-plan"];
if (!slot) {
  console.error("No day-plan slot");
  process.exit(1);
}
const now = new Date().toISOString();
slot.status = "image-approved";
slot.copyApprovedAt = now;
slot.imageApprovedAt = now;
slot.approvedBy = "stephen-in-chat";
writeFileSync(SCHEDULE_FILE, JSON.stringify(sched, null, 2) + "\n");
console.log("✅ Slot marked image-approved (copy + image both approved).");
