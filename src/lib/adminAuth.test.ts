// Tests for isAdmin — the shared admin-auth check used by the newsletter
// tracker endpoints. Security-critical, so pin the contract: Bearer preferred,
// legacy ?key= fallback honored, everything rejected when unconfigured.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { isAdmin } from "./adminAuth.ts";

const KEY = "test-admin-key-123";
let prev: string | undefined;
beforeEach(() => {
  prev = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = KEY;
});
afterEach(() => {
  if (prev === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = prev;
});

function req({ bearer, key }: { bearer?: string; key?: string } = {}): Request {
  const url = key
    ? `https://x.test/api/admin/x?key=${encodeURIComponent(key)}`
    : "https://x.test/api/admin/x";
  const headers: Record<string, string> = {};
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return new Request(url, { headers });
}

test("accepts a correct Bearer token", () => {
  assert.equal(isAdmin(req({ bearer: KEY })), true);
});

test("accepts the legacy ?key= fallback", () => {
  assert.equal(isAdmin(req({ key: KEY })), true);
});

test("rejects a wrong Bearer token", () => {
  assert.equal(isAdmin(req({ bearer: "nope" })), false);
});

test("rejects a wrong ?key=", () => {
  assert.equal(isAdmin(req({ key: "nope" })), false);
});

test("rejects when no credentials are supplied", () => {
  assert.equal(isAdmin(req()), false);
});

test("rejects everything when ADMIN_KEY is not configured", () => {
  delete process.env.ADMIN_KEY;
  assert.equal(isAdmin(req({ bearer: KEY })), false);
  assert.equal(isAdmin(req({ key: KEY })), false);
});

test("Bearer wins even when the query param is wrong", () => {
  const r = new Request("https://x.test/api/admin/x?key=wrong", {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  assert.equal(isAdmin(r), true);
});
