#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Camp art: the illustrated set the /camps pages wear (one hero, one image per
// interest). Generated once with Recraft and committed as small WebP files in
// public/images/camps/, so the site never calls Recraft at build or run time.
//
//   node scripts/camps/generate-camp-art.mjs            # only missing images
//   node scripts/camps/generate-camp-art.mjs --force    # regenerate all
//   node scripts/camps/generate-camp-art.mjs --only=stem,swim --force
//
// Every image shares STYLE so the set reads as one poster series. Raw Recraft
// output goes to --raw-dir (default: a temp folder) for review; only the
// resized WebP derivatives are committed.
// ---------------------------------------------------------------------------

import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { generateRecraftImage } from "../social/lib/recraft.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "public", "images", "camps");

const STYLE =
  "Retro screen-printed summer poster illustration with a risograph grain texture: bold flat shapes, " +
  "chunky simple figures, slight misregistration, joyful and sunny. Limited palette of sunset orange, " +
  "hot coral pink, violet, aqua teal and sunshine yellow with deep navy ink linework, on a plain white " +
  "background with generous white space around the scene. No text, no letters, no numbers, no logos.";

// Palette: the SBT day arc (sunset, coral, accent violet, teal), gold and ink.
const COLORS = [
  [255, 123, 43],
  [244, 63, 124],
  [135, 56, 245],
  [34, 198, 211],
  [255, 211, 56],
  [19, 7, 47],
].map((rgb) => ({ rgb }));

/** key → [subject, aspect, output width, output height] */
const ART = {
  hero: [
    "A wide South Bay summer panorama: small sailboats on a calm lake, golden oak-dotted foothills, a big round sun, " +
      "a few kids paddling a kayak and others biking along a path, palm and oak trees",
    "16:9",
    1440,
    810,
  ],
  stem: ["Two kids building a small wheeled robot at a workbench while a model rocket launches beside them", "1:1", 480, 480],
  arts: ["Kids painting a giant colorful mural together, brushes, paint cans and big splashes", "1:1", 480, 480],
  sports: ["Kids playing soccer on a sunny field, one kid mid-kick and a ball flying toward a goal", "1:1", 480, 480],
  academic: ["Kids reading books and writing in notebooks at a picnic table under a shady tree", "1:1", 480, 480],
  adventure: ["Kids on a ropes course high between trees, one zip-lining with arms out", "1:1", 480, 480],
  general: ["A cheerful group of kids at summer day camp playing tug of war on the grass", "1:1", 480, 480],
  nature: ["Kids hiking a trail through golden California hills with oak trees, one looking through binoculars at a bird", "1:1", 480, 480],
  music: ["Kids playing guitar, drums and a keyboard together in a garage band", "1:1", 480, 480],
  animals: ["Kids at a small farm feeding a goat and holding a bunny, a chicken nearby", "1:1", 480, 480],
  culinary: ["Kids in aprons and chef hats rolling out pizza dough and decorating cookies", "1:1", 480, 480],
  swim: ["Kids cannonballing into a bright blue swimming pool with big splashes", "1:1", 480, 480],
  language: ["Kids sitting around a big spinning globe, pointing at places and smiling", "1:1", 480, 480],
  faith: ["Kids singing together around a campfire at dusk at a summer camp, cabins and pine trees behind", "1:1", 480, 480],
  "special-needs": [
    "Kids of all abilities playing together in a sunny park, one kid in a wheelchair tossing a beach ball to friends",
    "1:1",
    480,
    480,
  ],
};

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = (args.find((a) => a.startsWith("--only="))?.slice(7) ?? "").split(",").filter(Boolean);
const rawDir = args.find((a) => a.startsWith("--raw-dir="))?.slice(10) ?? join(tmpdir(), "sbt-camp-art-raw");

mkdirSync(OUT, { recursive: true });
mkdirSync(rawDir, { recursive: true });

const keys = Object.keys(ART).filter((k) => (only.length ? only.includes(k) : true));
const todo = keys.filter((k) => force || !existsSync(join(OUT, `${k}.webp`)));
if (!todo.length) {
  console.log("Camp art is complete; pass --force to regenerate.");
  process.exit(0);
}

async function make(key) {
  const [subject, size, width, height] = ART[key];
  const prompt = `${subject}. ${STYLE}`;
  const { buffer } = await generateRecraftImage({ prompt, size, colors: COLORS });
  writeFileSync(join(rawDir, `${key}.png`), buffer);
  const webp = await sharp(buffer).resize(width, height, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  writeFileSync(join(OUT, `${key}.webp`), webp);
  console.log(`${key}: ${(webp.length / 1024).toFixed(0)} KB`);
}

// A few at a time keeps Recraft's rate limit happy.
const queue = [...todo];
const failures = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const key = queue.shift();
      try {
        await make(key);
      } catch (err) {
        failures.push(key);
        console.error(`${key}: ${err.message}`);
      }
    }
  }),
);
console.log(`Raw images: ${rawDir}`);
if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}`);
  process.exit(1);
}
