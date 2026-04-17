/**
 * Inbound events storage — Vercel Blob in prod, filesystem in local dev.
 *
 * Same trick as Stoa: if BLOB_READ_WRITE_TOKEN is set, use blob. Otherwise
 * fall back to a local JSON file so dev works without any platform plumbing.
 *
 * Two stores:
 *   - inbound-events.json  — the full extracted-event list (append-only for now)
 *   - inbound-intake-log.json — dedup/audit log keyed by hash(from+subject+messageId)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { put, head, list } from "@vercel/blob";
import type { InboundEvent, InboundIntakeLog } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function dataPath(name: string): string {
  return join(__dirname, "../../../src/data/south-bay", name);
}

const EVENTS_PATH = dataPath("inbound-events.json");
const LOG_PATH = dataPath("inbound-intake-log.json");

const EVENTS_BLOB_KEY = "lookout/inbound-events.json";
const EVENTS_SHARD_PREFIX = "lookout/events-shards/";
const LOG_BLOB_KEY = "lookout/inbound-intake-log.json";

function getBlobToken(): string | null {
  const fromProcess = typeof process !== "undefined" ? process.env?.BLOB_READ_WRITE_TOKEN : undefined;
  const fromImport = typeof import.meta !== "undefined" ? (import.meta as ImportMeta).env?.BLOB_READ_WRITE_TOKEN : undefined;
  return (fromProcess ?? fromImport) || null;
}

function hasBlobToken(): boolean {
  return !!getBlobToken();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readInboundEvents(): Promise<InboundEvent[]> {
  if (hasBlobToken()) {
    const merged: InboundEvent[] = [];

    // Legacy monolithic blob (pre-sharding). Kept as a first read so older
    // events remain visible during/after the migration.
    const legacy = await readBlobJson(EVENTS_BLOB_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as InboundEvent[];
        if (Array.isArray(parsed)) merged.push(...parsed);
      } catch {
        // ignore
      }
    }

    // Per-email shards — race-free writes. List + fetch each.
    const token = getBlobToken();
    if (token) {
      try {
        const { blobs } = await list({ prefix: EVENTS_SHARD_PREFIX, token });
        const shardJson = await Promise.all(
          blobs.map(async (b) => {
            try {
              const res = await fetch(`${b.url}?_cb=${Date.now()}`, { cache: "no-store" });
              if (!res.ok) return null;
              return (await res.text()) as string;
            } catch {
              return null;
            }
          })
        );
        for (const raw of shardJson) {
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as InboundEvent[];
            if (Array.isArray(parsed)) merged.push(...parsed);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore list failures — legacy blob still covered above
      }
    }

    // Dedup by id in case an event somehow appears in both legacy + shard.
    const seen = new Set<string>();
    return merged.filter((e) => {
      if (!e || typeof e.id !== "string") return false;
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }
  if (!existsSync(EVENTS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(EVENTS_PATH, "utf-8")) as InboundEvent[];
  } catch {
    return [];
  }
}

/**
 * Write a batch of events from a single email to its own shard blob.
 * Race-free: each email has a unique dedupHash, so concurrent webhooks
 * write to distinct keys rather than clobbering a shared blob.
 */
export async function writeInboundEventsForEmail(
  shardKey: string,
  events: InboundEvent[]
): Promise<void> {
  if (events.length === 0) return;
  const json = JSON.stringify(events, null, 2);
  if (hasBlobToken()) {
    await writeBlobJson(`${EVENTS_SHARD_PREFIX}${shardKey}.json`, json);
    return;
  }
  // Local dev fallback — still read-modify-write, but there's no concurrency.
  ensureDir(EVENTS_PATH);
  const existing = existsSync(EVENTS_PATH)
    ? (JSON.parse(readFileSync(EVENTS_PATH, "utf-8")) as InboundEvent[])
    : [];
  writeFileSync(EVENTS_PATH, JSON.stringify([...existing, ...events], null, 2));
}

export async function readIntakeLog(): Promise<InboundIntakeLog[]> {
  if (hasBlobToken()) {
    const raw = await readBlobJson(LOG_BLOB_KEY);
    if (raw === null) return [];
    try {
      return JSON.parse(raw) as InboundIntakeLog[];
    } catch {
      return [];
    }
  }
  if (!existsSync(LOG_PATH)) return [];
  try {
    return JSON.parse(readFileSync(LOG_PATH, "utf-8")) as InboundIntakeLog[];
  } catch {
    return [];
  }
}

export async function writeIntakeLog(log: InboundIntakeLog[]): Promise<void> {
  const json = JSON.stringify(log, null, 2);
  if (hasBlobToken()) {
    await writeBlobJson(LOG_BLOB_KEY, json);
    return;
  }
  ensureDir(LOG_PATH);
  writeFileSync(LOG_PATH, json);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function generateInboundEventId(): string {
  return `inbound_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dedupHashFor(from: string, subject: string, messageId: string): string {
  return createHash("sha1").update(`${from}|${subject}|${messageId}`).digest("hex").slice(0, 16);
}

/**
 * Content-based hash for dedup across forwards. Normalizes the subject
 * (strips FW:/Fwd:/Re: prefixes) and hashes it with the first N chars of
 * the body, so a forwarded copy of an email we already processed lands on
 * the same hash as the original.
 */
export function contentHashFor(subject: string, body: string): string {
  const prefixRe = /^\s*(fwd?|re|fw):\s*/i;
  let normalizedSubject = subject;
  while (prefixRe.test(normalizedSubject)) {
    normalizedSubject = normalizedSubject.replace(prefixRe, "");
  }
  normalizedSubject = normalizedSubject.trim().toLowerCase();
  const bodySignature = body.slice(0, 1500).replace(/\s+/g, " ").trim();
  return createHash("sha1")
    .update(`${normalizedSubject}|${bodySignature}`)
    .digest("hex")
    .slice(0, 16);
}

async function readBlobJson(pathname: string): Promise<string | null> {
  const token = getBlobToken();
  if (!token) return null;
  try {
    const meta = await head(pathname, { token });
    if (!meta?.url) return null;
    const res = await fetch(`${meta.url}?_cb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return await res.text();
  } catch (err) {
    if ((err as Error).name === "BlobNotFoundError") return null;
    if (/404|not.found/i.test((err as Error).message)) return null;
    throw err;
  }
}

async function writeBlobJson(pathname: string, json: string): Promise<void> {
  const token = getBlobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not available");
  await put(pathname, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
    cacheControlMaxAge: 0,
  });
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
