import { setTimeout as delay } from "node:timers/promises";

export const WATCHDOG_LOCK_WAIT_MS = 20 * 60_000;
export const LOCK_RETRY_INTERVAL_MS = 60_000;

// An hourly watchdog can repeatedly collide with another hourly repo writer.
// Retry acquisition through the existing mutex; never touch its holder/files.
// Normal scheduled slots retain their immediate-defer behavior.
export async function acquireRefreshLock({
  tryAcquire,
  maxWaitMs = 0,
  retryMs = LOCK_RETRY_INTERVAL_MS,
  now = () => performance.now(),
  sleep = delay,
  onWait = () => {},
}) {
  const deadline = now() + maxWaitMs;
  while (!tryAcquire()) {
    const remaining = deadline - now();
    if (remaining <= 0) return false;
    const waitMs = Math.min(retryMs, remaining);
    onWait(waitMs);
    await sleep(waitMs);
  }
  return true;
}
