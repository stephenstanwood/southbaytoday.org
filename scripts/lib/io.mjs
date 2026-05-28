// ---------------------------------------------------------------------------
// Atomic file writes for generator scripts.
// ---------------------------------------------------------------------------
// Direct `writeFileSync(path, JSON.stringify(...))` is NOT crash-safe: if the
// process is killed (OOM, SIGKILL, power loss) partway through, the target is
// left truncated/corrupt. These JSON files are load-bearing — a corrupt
// upcoming-events.json or default-plans.json breaks the site or, worse, gets
// silently re-read as `{}` and clobbered on the next run. (This is the bug
// class that once erased 910 day-plans.)
//
// writeJsonAtomic serializes to a temp file in the SAME directory, then does a
// single atomic rename over the target. A crash mid-write leaves the original
// intact and only an orphan .tmp file behind.
// ---------------------------------------------------------------------------

import { writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Atomically write a string to `path` (temp file + rename).
 * @param {string} path
 * @param {string} contents
 */
export function writeFileAtomic(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  // Temp file must be on the same filesystem (same dir) for rename() to be atomic.
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, contents);
    renameSync(tmp, path);
  } catch (err) {
    // Best-effort cleanup of the temp file; never mask the original error.
    try { unlinkSync(tmp); } catch { /* temp may not exist */ }
    throw err;
  }
}

/**
 * Atomically write `data` as pretty-printed JSON to `path`.
 * Serialization happens before any file I/O, so a non-serializable value
 * throws without touching the existing file.
 * @param {string} path
 * @param {unknown} data
 * @param {{ indent?: number }} [opts]
 */
export function writeJsonAtomic(path, data, { indent = 2 } = {}) {
  const json = JSON.stringify(data, null, indent);
  if (json === undefined) {
    throw new TypeError(`writeJsonAtomic: value for ${path} is not JSON-serializable`);
  }
  writeFileAtomic(path, json);
}
