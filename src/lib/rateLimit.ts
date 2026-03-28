const hits = new Map<string, number[]>();

const DEFAULT_MAX = 200;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_ENTRIES = 10_000;

let lastCleanup = Date.now();

/** Remove stale IP entries to prevent unbounded memory growth. */
function cleanup(windowMs: number) {
  const now = Date.now();
  for (const [ip, timestamps] of hits) {
    const recent = timestamps.filter((t) => now - t < windowMs);
    if (recent.length === 0) {
      hits.delete(ip);
    } else {
      hits.set(ip, recent);
    }
  }
  lastCleanup = now;
}

export function rateLimit(
  ip: string,
  max: number = DEFAULT_MAX,
  windowMs: number = DEFAULT_WINDOW_MS,
): boolean {
  const now = Date.now();

  // Periodic cleanup of stale entries
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanup(windowMs);
  }

  const timestamps = hits.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    hits.set(ip, recent);
    return false;
  }

  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > MAX_ENTRIES) {
    hits.delete(hits.keys().next().value!);
  }
  return true;
}

export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again in a minute." }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}
