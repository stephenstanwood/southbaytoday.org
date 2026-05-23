#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Send today's newsletter.
//
// Default: creates a Resend Broadcast for the configured audience and sends it.
// --test <email>: skips broadcasts, sends a one-shot to that address (for QA).
// --dry-run: builds the HTML but doesn't call Resend.
//
// Usage:
//   node scripts/newsletter/send.mjs --test stephen@stanwood.dev
//   node scripts/newsletter/send.mjs                                  # broadcast
//   node scripts/newsletter/send.mjs --date 2026-05-06 --dry-run
// ---------------------------------------------------------------------------

import {
  assembleNewsletterData, renderEmail, resendFetch,
  recordNewsletterSend, sendNewsletterDiscordDm,
  todayPT, loadConfig, FROM_ADDRESS, REPLY_TO,
} from "./lib.mjs";

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
}
function bool(name) { return args.includes(`--${name}`); }

const date = flag("date") || todayPT();
const testTo = flag("test");
const dryRun = bool("dry-run");
const editorial = !bool("no-editorial");

async function main() {
  const data = await assembleNewsletterData(date, { editorial });
  const { subject, html } = renderEmail(data);

  console.log(`subject: ${subject}`);
  console.log(`events: ${data.todayEvents.length}, featured: ${data.featuredEvents.length}, openings: ${data.recentOpenings.length}, history: ${data.todayHistory.length}, meetings: ${data.tonightMeetings.length}, conversation: ${data.redditPosts.length}`);
  console.log(`editorial: ${data.editorialMeta?.status || "unknown"}`);

  if (!data.dayPlan && !data.todayEvents.length) {
    console.error("⚠️  No day-plan AND no events for today — refusing to send empty newsletter.");
    process.exit(1);
  }

  if (dryRun) {
    console.log("dry-run: skipping send");
    return;
  }

  if (testTo) {
    const res = await resendFetch("/emails", {
      method: "POST",
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: testTo,
        reply_to: REPLY_TO,
        subject,
        html,
      }),
    });
    console.log(`sent test → ${testTo}: ${res.id}`);
    return;
  }

  const cfg = loadConfig();
  if (!cfg.audienceId) {
    console.error("no audienceId in newsletter-config.json — run setup-audience.mjs first");
    process.exit(1);
  }

  const broadcast = await resendFetch("/broadcasts", {
    method: "POST",
    body: JSON.stringify({
      audience_id: cfg.audienceId,
      from: FROM_ADDRESS,
      reply_to: REPLY_TO,
      subject,
      html,
      name: `daily-${date}`,
    }),
  });
  console.log(`broadcast created: ${broadcast.id}`);

  const sendRes = await resendFetch(`/broadcasts/${broadcast.id}/send`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  console.log(`broadcast sent: ${JSON.stringify(sendRes)}`);

  let dmError = null;
  try {
    await sendNewsletterDiscordDm(data, subject);
    console.log("discord DM sent");
  } catch (err) {
    dmError = err;
    console.error(`discord DM failed: ${err.message}`);
  }

  await recordNewsletterSend({ data, subject, broadcastId: broadcast.id });
  console.log("newsletter send recorded");

  if (dmError) throw dmError;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
