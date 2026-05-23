#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Build today's newsletter HTML and print to stdout (or write to --out path).
// Usage:
//   node scripts/newsletter/build.mjs                 # today, stdout
//   node scripts/newsletter/build.mjs --date 2026-05-06
//   node scripts/newsletter/build.mjs --out /tmp/newsletter.html
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { assembleNewsletterData, renderEmail, todayPT } from "./lib.mjs";

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
}
function bool(name) { return args.includes(`--${name}`); }

const date = flag("date") || todayPT();
const out = flag("out");
const editorial = !bool("no-editorial");

const data = await assembleNewsletterData(date, { editorial });
const { subject, html } = renderEmail(data);

if (out) {
  writeFileSync(out, html, "utf8");
  console.error(`wrote ${out}`);
  console.error(`subject: ${subject}`);
} else {
  process.stdout.write(html);
  process.stderr.write(`\n\nsubject: ${subject}\n`);
}
