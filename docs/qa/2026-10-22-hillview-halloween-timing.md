# Hillview Halloween storytime timing

Official organizer: <https://sjpl.bibliocommons.com/v2/events/6aa860334ea230006f3407bf>

Verified in the rendered BiblioCommons event page on October 22, 2026 UTC.
The event header gives October 25, 12:30–1:30 PM, at Hillview. Its body lists
“Storytime 12:30 - 1:00 am” and “Stay & Play 1:00 - 1:30 pm”, plus 30 minutes
of play after storytime. Admission is free, with no registration required.
The organizer still publishes the conflict; there is no corrected source
breakdown to quote.

Keep the event's existing date, header clocks, location, admission, URL, image,
audience and reviewed blurb. Replace only the conflicting schedule clause
with the verified overall window and an explicit request to confirm the session
timing with Hillview Library. Use the existing `needs-confirmation` attendance
state so recommendation surfaces do not promise a confirmed visit.

This is a repeated upstream copy defect: the October 18 Hillview occurrence
has a separate dated correction in `eventSourceFacts.mjs`. Do not extend that
occurrence's inferred AM-to-PM replacement to this event or to all storytimes.
The new correction matches only the October 25 official URL, existing header
clocks and conflicting body. It runs in the existing verified-facts pipeline,
preserves new shorter or corrected source descriptions, and survives retained
source snapshots without running a broad refresh.

The regression exercises both organizer URL forms and raw/normalized list
copy through `resolveEventBlurbs`, checks repeat application, preserves every
unaffected event field, and excludes other dates, URLs and newer source copy.
