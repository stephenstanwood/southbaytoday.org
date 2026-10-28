# APOD refresh

`node scripts/generate-apod.mjs` reads the dated articles linked by NASA's
[APOD archive](https://science.nasa.gov/apod/archive/). It keeps up to 12 images
from the last 15 calendar dates, newest first. Videos are skipped. Each output
row retains its NASA article permalink and the article's credit text.
The dated permalink may use either `/image-article/apod-YYYY-month-D-slug/`
or `/image-article/apod/YYYY-month-D-slug/`; both retain their exact canonical
URL and must match the archive label and article date.

On October 21, 2026 the legacy `api.nasa.gov/planetary/apod` endpoint returned
HTTP 200 with 15 different dates, all titled `NASA Science`, all pointing at
NASA's logo, and all carrying today's explanation. The old daily URLs redirect
to NASA Science after the site migration. A successful HTTP response or fresh
`generatedAt` therefore does not establish valid APOD content.

The generator now checks the archive's label against the dated permalink,
then checks each article's canonical URL, featured title and explicit APOD Date
metadata. It extracts only the featured media module, never a site logo,
related-story image or video thumbnail. Titles, explanations and image assets
must be distinct across output dates; resizing query strings do not make an
image distinct. Unknown layouts, redirects, missing fields, stale archives,
HTTP failures and invalid content fail before the atomic write. The previous
artifact, including its timestamp, remains byte-for-byte unchanged on failure.
An invalid previous artifact is not automatically considered good fallback data.

The public NASA Science robots policy allowed these paths when checked on
October 21. Requests run sequentially, one second apart, with a 30-second
timeout and no automatic retries. No API key or paid dependency is required.
The existing refresh caller, repo mutex and publication gates remain in place.

Validation:

```sh
node --test scripts/generate-apod.test.mjs
node scripts/generate-apod.mjs --check
node scripts/generate-apod.mjs --output /absolute/private/candidate.json
```

`--check [PATH]` checks an existing artifact without fetching or writing.
`--output PATH` runs the same acquisition and validation but writes a candidate
outside the committed artifact. Do not publish a candidate until it has passed
validation. The offline fixtures retain dated NASA source excerpts and the
exact 12-row rejected committed artifact for this regression.
