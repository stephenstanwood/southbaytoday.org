#!/usr/bin/env node
// ---------------------------------------------------------------------------
// One-time: create the Resend Audience and seed Stephen.
// Writes the audience id to src/data/south-bay/newsletter-config.json so the
// send/subscribe flow can find it.
// ---------------------------------------------------------------------------

import { writeFileAtomic } from "../lib/io.mjs";
import { resendFetch, CONFIG_PATH, loadConfig } from "./lib.mjs";

const AUDIENCE_NAME = "South Bay Today — Daily";
const SEED_EMAIL = "stephen@stanwood.dev";
const SEED_FIRST = "Stephen";

async function main() {
  const cfg = loadConfig();
  let audienceId = cfg.audienceId;

  if (audienceId) {
    console.log(`audience already exists: ${audienceId}`);
  } else {
    const created = await resendFetch("/audiences", {
      method: "POST",
      body: JSON.stringify({ name: AUDIENCE_NAME }),
    });
    audienceId = created.id;
    console.log(`created audience: ${audienceId}`);
    writeFileAtomic(CONFIG_PATH, JSON.stringify({
      audienceId,
      audienceName: AUDIENCE_NAME,
      createdAt: new Date().toISOString(),
    }, null, 2));
    console.log(`wrote ${CONFIG_PATH}`);
  }

  // Seed Stephen as first contact
  try {
    const contact = await resendFetch(`/audiences/${audienceId}/contacts`, {
      method: "POST",
      body: JSON.stringify({
        email: SEED_EMAIL,
        first_name: SEED_FIRST,
        unsubscribed: false,
      }),
    });
    console.log(`seeded ${SEED_EMAIL}: ${contact.id}`);
  } catch (err) {
    if (String(err).includes("already exists")) {
      console.log(`${SEED_EMAIL} already in audience`);
    } else {
      throw err;
    }
  }

  console.log("\nNext steps:");
  console.log("  1. Verify southbaytoday.org for sending in Resend dashboard if you haven't already");
  console.log("  2. Run: node scripts/newsletter/send.mjs --test stephen@stanwood.dev");
  console.log("  3. Once happy, schedule via launchd (see newsletter-send.plist)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
