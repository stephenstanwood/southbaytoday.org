#!/usr/bin/env node
// One-time: generate abstract Recraft images for tonight-pick and wildcard
// slots that don't have images yet.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildImagePrompt } from "./lib/poster-styles.mjs";
import { generateAndUpload } from "./lib/recraft.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE = join(__dirname, "..", "..", "src", "data", "south-bay", "social-schedule.json");

const d = JSON.parse(readFileSync(SCHEDULE, "utf8"));
let count = 0;

for (const [date, day] of Object.entries(d.days || {}).sort(([a], [b]) => a.localeCompare(b))) {
  for (const slotType of ["tonight-pick", "wildcard"]) {
    const slot = day[slotType];
    if (!slot || slot.imageUrl) continue;

    const postCopy = slot.copy?.x || "";
    const category = slot.item?.category || "";
    if (!postCopy) continue;

    try {
      const prompt = await buildImagePrompt(postCopy, category);
      console.log(`${date} ${slotType}: generating...`);
      const pathname = `posters/${date}-${slotType}.png`;
      const { url } = await generateAndUpload({ prompt, pathname });
      slot.imageUrl = url;
      slot.imageStyle = "abstract";
      // Don't auto-approve — Stephen will review
      count++;
      console.log(`  ✅ ${url.slice(0, 60)}`);

      // Save after each to preserve progress
      writeFileSync(SCHEDULE, JSON.stringify(d, null, 2) + "\n");

      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

console.log(`\nDone: ${count} abstract images generated`);
