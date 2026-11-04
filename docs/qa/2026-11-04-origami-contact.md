# Cupertino origami accessibility contact

The November 19, 2026 “Origami for School Age Kids” occurrence at Cupertino
Library contains one malformed accessibility phone token. The publisher event
page prints `(408) 540-39477`; its BiblioCommons HTML has
`(408) 540-3947</a>7`, which becomes `(408) 540-3947 7` during ingestion.

The publisher’s independent [Accessibility page](https://sccld.org/accessibility/)
confirms `(408) 540-3947` for assistance submitting the accommodation form.
Both pages were fetched successfully on the Mini on November 4, 2026 at
20:13 UTC after checking their robots policies.

- [Exact event](https://sccl.bibliocommons.com/events/6ae2292c0b801373af915568)
- Event HTML SHA-256: `4fb889ce52bb0d0593e01b32a1b518c5a1e649de54adefd98844dd828c938a39`
- Accessibility HTML SHA-256: `69bad5554163946a0569baf1136a3b2b44f2adf348a4983c1f32ea3e867d27ad`
- The regression fixture retains the exact source event from the scheduled
  fact-check’s already captured BiblioCommons response; no second full source
  audit was started. Its response SHA-256 is
  `cc98cbd3ae4ed49e162c86fe9c4fddebd23b07ff358c2101efdab2c420997291`.

## Scope and refresh behavior

The correction is bound to the exact source URL (including the retained `/v2/`
alias) and November 19 occurrence. It replaces only the known malformed token
before the publisher’s comma and email instruction. It does not replace the
whole description, infer phone numbers, or affect another event, future date,
updated contact, extension, or longer digit sequence.

The existing verified-facts path applies it during normal generation and blurb
resolution. Source-specific regression coverage replays the captured SCCLD
adapter three times, passes through description normalization and final copy
polish, checks the complete published description, and checks every other
field for preservation. It also covers retained feed data, both malformed
spellings, cached copy, URL aliases and revised source text.

Only this contact token changes in the generated feed. ID, title, date, clocks,
venue, K–8 eligibility, drop-in wording, caregiver participation, URL, email,
price, imagery and metadata remain as published.
