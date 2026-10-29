# Place photos

`src/pages/api/place-photo.ts` serves the same photo URL contract to cards,
event pages and structured data, shared plans, and newsletter readers.
`src/lib/placePhoto.mjs` chooses the upstream source.

## Official venue images

`src/data/south-bay/venue-photos.json` maps a Google place ID to an image
published by that venue or its official operator. The registry records the
source page, publisher, actual pixel dimensions, verification date, and source
image hash. The repository contains links and provenance, not mirrored images.

Prefer a clear venue photograph over a logo, event poster, tour button, or
generic stock image. Verify the actual bytes and appearance before adding a
row. The image must fit within the loader's 8 MiB source limit. A thumbnail
must not be enlarged to replace a hero or structured-data image: the loader
requires both source dimensions to meet the requested dimensions, checks the
decoded image again, and crops before downsampling. Small official theatre
photos therefore serve small cards while larger placements still use Google.

Official sources get a short timeout. Missing files, HTML responses, changed
dimensions, decode errors, and network failures retain the Google fallback.
Successful official responses expose their provenance through the existing
`Link: <sourcePage>; rel="describedby"` header and
`X-SBT-Photo-Source: venue`. Event-specific art still takes precedence in
consumers that already provide it.

## Measure provider work

Vercel request logs distinguish CDN hits from origin misses. An origin miss is
not automatically a Google request: it can be an official image, a canonical
redirect, or a rejected request.

Runtime log events distinguish the actual work:

- `place-photo-google-request`: emitted immediately before each Google fetch;
  count these to include retries and failed attempts.
- `place-photo-upstream`: successful result with `source: venue` or
  `source: google-places`; this older event excludes failed attempts.
- `place-photo-venue-fallback`: an eligible official source failed, causing
  the request to continue to Google.

Events contain place IDs and dimensions, without API keys or photo tokens.
Use Vercel's request ID to join provider work to request records when diagnosing
cache misses or crawler traffic. Keep account-level billing analysis outside
this repository. Compare equivalent time windows and deployments before
claiming measured savings; matching historical requests to a new official
source is an eligibility projection, not a billing result.

## Google content and refresh

The loader shares concurrent identical requests but retains no completed Google
photos or URLs. This source expansion does not change cache TTLs or add image
storage. Before changing Google-content caching or storage, check the current
[Places policies](https://developers.google.com/maps/documentation/places/web-service/policies),
[photo documentation](https://developers.google.com/maps/documentation/places/web-service/place-photos),
and [service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).
Photo names expire and are subject to restrictions; existing HTTP headers do
not establish permission to persist or redistribute Google's images.

The Mini's photo-reference refresh runs daily but skips a full refresh for
25 days, with pending and targeted repairs supported between full refreshes.
The separate health sentinel normally samples 20 Google photos per day before
retries. Keep those safeguards: the request traffic and actual provider attempts
are the useful measures of photo demand.

## Verification

Run `node --test src/lib/placePhoto.test.mjs scripts/lib/photoref-health.test.mjs`.
For a source addition, also call the live loader without a Google key and inspect
the resized bytes. After deployment, check `X-SBT-Photo-Source`, image dimensions,
the provenance link, and a repeat request's `x-vercel-cache` on the canonical
production URL. Verify that oversized placements still return a Google image.
