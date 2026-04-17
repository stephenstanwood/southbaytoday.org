/**
 * Replay the intake log through the tracker so past inbound emails flip
 * matching rows to "receiving" and auto-add rows for unknown senders.
 *
 * Safe to re-run. Only considers log entries with outcomes that imply a
 * real newsletter (events-extracted, no-events, extractor-error).
 *
 * Usage: node scripts/lookout/backfill-receiving.mjs
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { head, put } from "@vercel/blob";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, "../../.env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const token = process.env.BLOB_READ_WRITE_TOKEN;
const LOG_KEY = "lookout/inbound-intake-log.json";
const TRACKER_KEY = "lookout/newsletter-tracker.json";

async function readBlobJson(key) {
  const meta = await head(key, { token });
  const res = await fetch(`${meta.url}?_cb=${Date.now()}`);
  return await res.json();
}

async function writeBlobJson(key, data) {
  await put(key, JSON.stringify(data, null, 2), {
    access: "public",
    token,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    contentType: "application/json",
  });
}

function parseFromHeader(raw) {
  if (!raw) return { address: "", displayName: "", domain: "" };
  const trimmed = raw.trim();
  const m = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  const address = (m ? m[2] : trimmed).toLowerCase().trim();
  const displayName = m ? m[1].replace(/^["']|["']$/g, "").trim() : "";
  const domain = address.split("@")[1] ?? "";
  return { address, displayName, domain };
}

function rootHost(host) {
  const h = host.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : h;
}

function findMatch(doc, fromRaw) {
  const { address, domain } = parseFromHeader(fromRaw);
  if (!address) return null;
  const senderRoot = rootHost(domain);
  return doc.targets.find((t) => {
    if ((t.seenFromAddresses ?? []).some((a) => a.toLowerCase() === address)) return true;
    if ((t.seenFromDomains ?? []).some((d) => d.toLowerCase() === domain)) return true;
    if (t.signupUrl) {
      try {
        const signupHost = new URL(t.signupUrl).hostname.toLowerCase().replace(/^www\./, "");
        if (signupHost === domain) return true;
        if (rootHost(signupHost) === senderRoot) return true;
      } catch {}
    }
    return false;
  }) ?? null;
}

function autoIdFromDomain(domain) {
  const slug = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return `auto-${slug || "sender"}`;
}

function prettyNameFromDomain(domain) {
  const parts = domain.toLowerCase().split(".").filter((p) =>
    !["www", "mail", "mailer", "news", "email", "em", "m", "smtp", "relay"].includes(p)
  );
  const core = parts.slice(0, Math.max(1, parts.length - 1)).join(" ");
  return core.replace(/\b\w/g, (c) => c.toUpperCase()) || domain;
}

// ── run ─────────────────────────────────────────────────────────────────────

const [log, doc] = await Promise.all([readBlobJson(LOG_KEY), readBlobJson(TRACKER_KEY)]);

// Keep only entries that imply a real newsletter hit
const REAL = new Set(["events-extracted", "no-events", "extractor-error"]);
const real = log.filter((e) => REAL.has(e.outcome));
console.log(`log entries total: ${log.length}, real newsletters: ${real.length}`);

// Sort chronologically so lastReceivedAt ends up on the latest
real.sort((a, b) => (a.receivedAt ?? "").localeCompare(b.receivedAt ?? ""));

const tombstones = new Set(doc.deletedIds ?? []);
let promoted = 0;
let added = 0;
let skipped = 0;
const autoAddedIds = new Set();

for (const entry of real) {
  const { address, displayName, domain } = parseFromHeader(entry.from);
  if (!address) { skipped++; continue; }
  const match = findMatch(doc, entry.from);

  if (match) {
    match.lastReceivedAt = entry.receivedAt;
    match.receivedCount = (match.receivedCount ?? 0) + 1;
    const promotable = ["signup-posted", "confirmed", "needs-manual", "retry", "not-attempted", "failed"];
    if (promotable.includes(match.status)) {
      if (match.status !== "receiving") promoted++;
      match.status = "receiving";
    }
    if (!match.seenFromAddresses.includes(address)) match.seenFromAddresses.push(address);
    if (domain && !(match.seenFromDomains ?? []).includes(domain)) {
      match.seenFromDomains = [...(match.seenFromDomains ?? []), domain];
    }
    continue;
  }

  const id = autoIdFromDomain(domain || address);
  if (tombstones.has(id)) { skipped++; continue; }
  const existing = doc.targets.find((t) => t.id === id);
  if (existing) {
    // Same auto-id, different sender domain — just bump
    existing.lastReceivedAt = entry.receivedAt;
    existing.receivedCount = (existing.receivedCount ?? 0) + 1;
    if (!existing.seenFromAddresses.includes(address)) existing.seenFromAddresses.push(address);
    continue;
  }
  doc.targets.push({
    id,
    name: displayName || prettyNameFromDomain(domain) || address,
    signupUrl: "",
    category: "other",
    provider: "unknown",
    priority: 3,
    status: "receiving",
    receivedCount: 1,
    lastReceivedAt: entry.receivedAt,
    seenFromAddresses: [address],
    seenFromDomains: domain ? [domain] : [],
    notes: "Auto-discovered from inbound email; no signup URL on file.",
  });
  autoAddedIds.add(id);
  added++;
}

doc.updatedAt = new Date().toISOString();
await writeBlobJson(TRACKER_KEY, doc);

console.log(`\nbackfill done:`);
console.log(`  promoted to receiving: ${promoted}`);
console.log(`  auto-added rows: ${added}`);
console.log(`  skipped (no address / tombstoned): ${skipped}`);
console.log(`  tracker targets now: ${doc.targets.length}`);
if (autoAddedIds.size > 0) {
  console.log(`\nnew auto-added ids:`);
  for (const id of autoAddedIds) console.log(`  - ${id}`);
}
