import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COPIED, OWN, ROOT, sourceHash } from "../../photo-cache/source-files.mjs";
import { PHOTO_CACHE_SECRET_HEADER, createPhotoCacheHandler, forwardToPhotoCache } from "./photoCache.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ref = "places/another-place/photos/opaque-token";
const search = new URLSearchParams({ ref, w: "200", h: "200" }).toString();
const cacheUrl = (query = search) => `https://photos.southbaytoday.org/api/place-photo?${query}`;
const photo = async () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", source: "google-places" });
const quiet = () => {};

test("the photo cache serves the site and refuses a miss from anyone else before any Google download", async () => {
  let loads = 0;
  const handle = createPhotoCacheHandler({ secret: "s3cret", apiKey: "k", loadPhoto: async () => { loads++; return photo(); } });
  assert.equal((await handle(new Request(cacheUrl()))).status, 403);
  assert.equal((await handle(new Request(cacheUrl(), { headers: { [PHOTO_CACHE_SECRET_HEADER]: "wrong!" } }))).status, 403);
  assert.equal(loads, 0);
  const served = await handle(new Request(cacheUrl(), { headers: { [PHOTO_CACHE_SECRET_HEADER]: "s3cret" } }));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("cache-control"), "public, max-age=86400, s-maxage=604800");
  assert.equal(loads, 1);
});

test("the photo cache takes canonical queries only, so each photo and size has one cache entry", async () => {
  const handle = createPhotoCacheHandler({ secret: "s", apiKey: "k", loadPhoto: photo });
  const headers = { [PHOTO_CACHE_SECRET_HEADER]: "s" };
  assert.equal((await handle(new Request(cacheUrl(`w=200&h=200&ref=${encodeURIComponent(ref)}`), { headers }))).status, 400);
  assert.equal((await handle(new Request(cacheUrl(`${search}&utm=x`), { headers }))).status, 400);
  assert.equal((await handle(new Request(cacheUrl(), { method: "POST", headers }))).status, 405);
});

test("without a configured secret the photo cache refuses every miss", async () => {
  const handle = createPhotoCacheHandler({ secret: "", apiKey: "k", loadPhoto: photo });
  assert.equal((await handle(new Request(cacheUrl(), { headers: { [PHOTO_CACHE_SECRET_HEADER]: "" } }))).status, 403);
});

test("the site relays settled answers with their caching and reports the cache state", async () => {
  for (const [status, cacheControl] of [
    [200, "public, max-age=86400, s-maxage=604800"],
    [404, "public, max-age=3600, s-maxage=86400"],
    [503, "no-store"],
  ]) {
    const seen = [];
    const relayed = await forwardToPhotoCache(search, {
      origin: "https://photos.southbaytoday.org/",
      secret: "s3cret",
      fetchImpl: async (url, init) => {
        seen.push({ url, init });
        return new Response("x", { status, headers: { "Cache-Control": cacheControl, "Content-Type": "image/jpeg", "X-Vercel-Cache": "HIT", "X-Other": "1" } });
      },
      log: quiet,
    });
    assert.equal(relayed.status, status);
    assert.equal(relayed.headers.get("cache-control"), cacheControl);
    assert.equal(relayed.headers.get("x-sbt-photo-cache"), "HIT");
    assert.equal(relayed.headers.get("x-other"), null, "only photo headers cross");
    assert.equal(seen[0].url, cacheUrl());
    assert.equal(seen[0].init.headers[PHOTO_CACHE_SECRET_HEADER], "s3cret");
  }
});

test("the site falls back to its own loader when the cache is unset, unreachable or refusing", async () => {
  const origin = "https://photos.southbaytoday.org";
  assert.equal(await forwardToPhotoCache(search, { origin: "", secret: "s", log: quiet }), null);
  assert.equal(await forwardToPhotoCache(search, { origin, secret: "", log: quiet }), null);
  assert.equal(await forwardToPhotoCache(search, { origin, secret: "s", fetchImpl: async () => { throw new Error("down"); }, log: quiet }), null);
  for (const status of [400, 403, 500, 502]) {
    const relayed = await forwardToPhotoCache(search, { origin, secret: "s", fetchImpl: async () => new Response("no", { status }), log: quiet });
    assert.equal(relayed, null, String(status));
  }
});

test("the photo cache project copies every local module the shared photo code imports", () => {
  const copied = new Set(COPIED.map(([source]) => source));
  for (const source of ["src/lib/placePhoto.mjs", "src/lib/photoCache.mjs"]) {
    assert.ok(copied.has(source), source);
    const text = readFileSync(join(repoRoot, source), "utf8");
    for (const [, spec] of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const imported = relative(repoRoot, join(repoRoot, dirname(source), spec));
      assert.ok(copied.has(imported), `${source} imports ${spec}: add it to COPIED in photo-cache/source-files.mjs`);
    }
  }
  for (const file of OWN) assert.ok(readFileSync(join(ROOT, file)).length > 0, file);
  assert.match(sourceHash(), /^[0-9a-f]{64}$/);
  assert.equal(sourceHash(), sourceHash());
});
