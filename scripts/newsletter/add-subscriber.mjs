#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Manually add an email to the newsletter audience.
// Usage: node scripts/newsletter/add-subscriber.mjs <email> [--name "Jane Doe"]
// ---------------------------------------------------------------------------

import { resendFetch, loadConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--name"));
const nameIdx = args.indexOf("--name");
const fullName = nameIdx === -1 ? "" : (args[nameIdx + 1] || "");

if (!email) {
  console.error("usage: add-subscriber.mjs <email> [--name 'First Last']");
  process.exit(1);
}

const cfg = loadConfig();
if (!cfg.audienceId) {
  console.error("no audienceId in newsletter-config.json — run setup-audience.mjs first");
  process.exit(1);
}

const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);

try {
  const res = await resendFetch(`/audiences/${cfg.audienceId}/contacts`, {
    method: "POST",
    body: JSON.stringify({
      email,
      first_name: first || undefined,
      last_name: rest.join(" ") || undefined,
      unsubscribed: false,
    }),
  });
  console.log(`added ${email}: ${res.id}`);
} catch (err) {
  if (String(err).includes("already exists")) {
    console.log(`${email} already in audience`);
  } else {
    console.error(err);
    process.exit(1);
  }
}
