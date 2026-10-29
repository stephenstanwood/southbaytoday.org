import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import venuePhotos from "../data/south-bay/venue-photos.json" with { type: "json" };
import { canonicalPhotoSearch, createPhotoLoader, parsePhotoRequest } from "./placePhoto.mjs";

const rinconada = "places/ChIJ44hkHAW7j4ARgHyd2BdSyN8/photos/opaque-token";
const other = "places/another-place/photos/opaque-token";
const request = (ref = rinconada, w = 200, h = 200) =>
  parsePhotoRequest(new URL(`https://southbaytoday.org/api/place-photo?${new URLSearchParams({ ref, w, h })}`));
const image = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } });
const quiet = () => {};

test("registered official venues serve thumbnails without a Google key or paid call", async () => {
  for (const venue of venuePhotos.photos) {
    const calls = [];
    const load = createPhotoLoader({
      fetchImpl: async (url) => { calls.push(url); return image(); },
      resize: async (body) => body,
      log: quiet,
    });
    const result = await load(request(`places/${venue.placeId}/photos/current-ref`, 200, 200), undefined);
    assert.equal(result.source, "venue", venue.name);
    assert.equal(result.sourcePage, venue.sourcePage);
    assert.deepEqual(calls, [venue.imageUrl]);
  }
});

test("large official photos cover metadata and heroes; small theatre images keep Google for larger placements", async () => {
  for (const venue of venuePhotos.photos) {
    for (const [w, h] of [[640, 480], [760, 420]]) {
      const calls = [];
      const load = createPhotoLoader({
        fetchImpl: async (url) => { calls.push(url); return image(); },
        resize: async (body) => body,
        log: quiet,
      });
      const result = await load(request(`places/${venue.placeId}/photos/current-ref`, w, h), "test-key");
      const fits = venue.width >= w && venue.height >= h;
      assert.equal(result.source, fits ? "venue" : "google-places", `${venue.name} ${w}x${h}`);
      assert.equal(calls.length, 1);
      assert.equal(new URL(calls[0]).hostname === "places.googleapis.com", !fits);
    }
  }
});

test("official portrait images are cropped before downsampling to avoid browser enlargement", async () => {
  const original = await sharp({ create: { width: 400, height: 570, channels: 3, background: "white" } }).jpeg().toBuffer();
  const load = createPhotoLoader({
    fetchImpl: async () => new Response(original, { headers: { "Content-Type": "image/jpeg" } }),
    log: quiet,
  });
  const result = await load(request(rinconada, 400, 300), undefined);
  const metadata = await sharp(result.body).metadata();
  assert.equal(result.source, "venue");
  assert.equal(metadata.width, 400);
  assert.equal(metadata.height, 300);
});

test("provider accounting counts failed attempts and retries without retaining URLs or credentials", async () => {
  const events = [];
  let calls = 0;
  const load = createPhotoLoader({
    fetchImpl: async () => ++calls === 1 ? new Response(null, { status: 503 }) : image(),
    log: (value) => events.push(JSON.parse(value)),
  });
  await load(request(other), "private-test-key");
  const attempts = events.filter((event) => event.event === "place-photo-google-request");
  assert.equal(attempts.length, calls);
  assert.deepEqual(attempts.map((event) => event.attempt), [1, 2]);
  assert.equal(JSON.stringify(events).includes("private-test-key"), false);
  assert.equal(JSON.stringify(events).includes("opaque-token"), false);
});

test("official library images avoid Google and preserve the requested size", async () => {
  const calls = [];
  const load = createPhotoLoader({
    fetchImpl: async (url) => { calls.push(url); return image(); },
    resize: async (body, photo) => { assert.equal(photo.width, 200); assert.equal(photo.height, 200); return body; },
    log: quiet,
  });
  const result = await load(request(), undefined);
  assert.equal(result.source, "venue");
  assert.match(result.sourcePage, /library.cityofpaloalto.org/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/paloalto.bibliocommons.com\//);
});

test("large images retain Google instead of enlarging a small official photo", async () => {
  const calls = [];
  const load = createPhotoLoader({ fetchImpl: async (url) => { calls.push(url); return image(); }, log: quiet });
  const result = await load(request(rinconada, 760, 420), "test-key");
  assert.equal(result.source, "google-places");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.hostname, "places.googleapis.com");
  assert.equal(url.searchParams.get("maxWidthPx"), "760");
});

test("an HTML response, missing official image, network fault, or decode failure falls back to Google", async () => {
  for (const failure of ["html", "404", "network", "decode"]) {
    const calls = [];
    const load = createPhotoLoader({
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("googleapis.com")) return image();
        if (failure === "html") return new Response("login", { headers: { "Content-Type": "text/html" } });
        if (failure === "404") return new Response("gone", { status: 404 });
        if (failure === "network") throw new Error("network");
        return image();
      },
      resize: async () => { throw new Error("invalid image"); },
      log: quiet,
    });
    assert.equal((await load(request(), "test-key")).source, "google-places", failure);
    assert.equal(calls.length, 2, failure);
  }
});

test("a missing API key cannot break a working official photo, but remains an error for other venues", async () => {
  const load = createPhotoLoader({ fetchImpl: async () => image(), resize: async (body) => body, log: quiet });
  assert.equal((await load(request(), undefined)).source, "venue");
  await assert.rejects(load(request(other), undefined), /Server config error/);
});

test("a source that changes to a low-resolution image falls back instead of shipping a blurry replacement", async () => {
  const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
  let calls = 0;
  const load = createPhotoLoader({
    fetchImpl: async (url) => {
      calls++;
      return url.includes("googleapis.com") ? image() : new Response(tiny, { headers: { "Content-Type": "image/jpeg" } });
    },
    log: quiet,
  });
  assert.equal((await load(request(), "test-key")).source, "google-places");
  assert.equal(calls, 2);
});

test("concurrent identical requests share one paid request; completed Google photos are not retained", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const load = createPhotoLoader({
    fetchImpl: async () => { calls++; await gate; return image(); },
    log: quiet,
  });
  const results = Array.from({ length: 10 }, () => load(request(other), "test-key"));
  assert.equal(calls, 1);
  release();
  const photos = await Promise.all(results);
  for (const photo of photos) assert.deepEqual([...photo.body], [1, 2, 3]);
  await load(request(other), "test-key");
  assert.equal(calls, 2);
});

test("a failed request is not retained and a later retry can recover", async () => {
  let calls = 0;
  const load = createPhotoLoader({ fetchImpl: async () => ++calls === 1 ? new Response(null, { status: 404 }) : image(), log: quiet });
  await assert.rejects(load(request(other), "test-key"), /Photo not found/);
  assert.equal((await load(request(other), "test-key")).source, "google-places");
  assert.equal(calls, 2);
});

test("permanent Google failures are not retried; a transient failure gets the existing single retry", async () => {
  for (const status of [400, 404, 429, 503]) {
    let calls = 0;
    const load = createPhotoLoader({ fetchImpl: async () => ++calls === 1 ? new Response(null, { status }) : image(), log: quiet });
    if (status >= 429) {
      assert.equal((await load(request(other), "test-key")).source, "google-places");
      assert.equal(calls, 2);
    } else {
      await assert.rejects(load(request(other), "test-key"), /Photo not found/);
      assert.equal(calls, 1);
    }
  }
});

test("canonical query removes cache-busting variants and retains the existing dimension bounds", () => {
  const input = new URL(`https://southbaytoday.org/api/place-photo?extra=tracking&h=900&w=1200&ref=${encodeURIComponent(other)}`);
  const parsed = parsePhotoRequest(input);
  assert.equal(parsed.width, 800);
  assert.equal(parsed.height, 600);
  const canonical = new URLSearchParams(canonicalPhotoSearch(parsed));
  assert.deepEqual([...canonical.keys()], ["ref", "w", "h"]);
  assert.equal(parsePhotoRequest(new URL(`https://example.com/?ref=${encodeURIComponent(other)}&w=-5&h=20.9`)).width, 1);
  assert.equal(parsePhotoRequest(new URL(`https://example.com/?ref=${encodeURIComponent(other)}&w=-5&h=20.9`)).height, 20);
  for (const ref of ["https://example.com/image", "places/../photos/test", "places/id/photos/test more", "places/id/photos/test/extra"]) {
    assert.equal(parsePhotoRequest(new URL(`https://example.com/?ref=${encodeURIComponent(ref)}`)), null);
  }
});
