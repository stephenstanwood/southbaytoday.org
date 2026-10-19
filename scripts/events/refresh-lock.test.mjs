import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireRefreshLock,
  LOCK_RETRY_INTERVAL_MS,
  WATCHDOG_LOCK_WAIT_MS,
} from "./refresh-lock.mjs";

function clock() {
  let elapsed = 0;
  const waits = [];
  return {
    now: () => elapsed,
    sleep: async (ms) => { waits.push(ms); elapsed += ms; },
    waits,
  };
}

test("a free repo lock is acquired immediately, even in watchdog mode", async () => {
  const time = clock();
  assert.equal(await acquireRefreshLock({
    ...time, tryAcquire: () => true, maxWaitMs: WATCHDOG_LOCK_WAIT_MS,
  }), true);
  assert.deepEqual(time.waits, []);
});

test("normal scheduled slots still defer immediately behind another holder", async () => {
  const time = clock();
  let attempts = 0;
  assert.equal(await acquireRefreshLock({
    ...time, tryAcquire: () => { attempts++; return false; },
  }), false);
  assert.equal(attempts, 1);
  assert.deepEqual(time.waits, []);
});

test("watchdog recovery acquires the repo after the existing holder releases it", async () => {
  const time = clock();
  const releasedAt = 3 * LOCK_RETRY_INTERVAL_MS;
  let attempts = 0;
  assert.equal(await acquireRefreshLock({
    ...time,
    tryAcquire: () => { attempts++; return time.now() >= releasedAt; },
    maxWaitMs: WATCHDOG_LOCK_WAIT_MS,
  }), true);
  assert.equal(attempts, 4);
  assert.equal(time.now(), releasedAt);
});

test("a holder that never releases remains untouched and the wait is bounded", async () => {
  const time = clock();
  let attempts = 0;
  assert.equal(await acquireRefreshLock({
    ...time, tryAcquire: () => { attempts++; return false; },
    maxWaitMs: WATCHDOG_LOCK_WAIT_MS,
  }), false);
  assert.equal(time.now(), 20 * 60_000);
  assert.equal(attempts, 21);
  assert.ok(time.waits.every((ms) => ms === LOCK_RETRY_INTERVAL_MS));
});

test("the final retry can acquire at the deadline without oversleeping it", async () => {
  const time = clock();
  const maxWaitMs = LOCK_RETRY_INTERVAL_MS + 5_000;
  assert.equal(await acquireRefreshLock({
    ...time, tryAcquire: () => time.now() >= maxWaitMs, maxWaitMs,
  }), true);
  assert.deepEqual(time.waits, [LOCK_RETRY_INTERVAL_MS, 5_000]);
});

test("lock-helper errors abort recovery instead of being retried as contention", async () => {
  const time = clock();
  await assert.rejects(acquireRefreshLock({
    ...time,
    tryAcquire: () => { throw new Error("lock helper failed"); },
    maxWaitMs: WATCHDOG_LOCK_WAIT_MS,
  }), /lock helper failed/);
  assert.deepEqual(time.waits, []);
});
