# Food permit refresh

The existing `southbaysignal-data-refresh` job on the Mini runs
`scripts/generate-scc-food-openings.mjs`. Its published lists remain capped at
12 each; console totals before that slice can be larger. A final inspection
does not establish an opening or an opening date.

`sourceHealth` in `scc-food-openings.json` separates three observations:

- A failed county HTTP/JSON request exits nonzero, preserves the prior output,
  and queues the actual request failure through the existing notification intake.
- Dataset age comes from SCC's `X-SODA2-Truth-Last-Modified` response header,
  falling back to `Last-Modified`. More than 14 days without a county update
  triggers a source-age alert. Missing metadata is reported as unknown.
- The newest raw and eligible inspection dates are recorded separately. A
  quiet or empty eligible restaurant list does not trigger a freshness alert.
  Schools, mobile facilities and vending remain intentionally excluded.

Optional blurbs use a structured JSON schema, exact record IDs, low effort and
a 3,072-token budget. One retry has a 4,608-token ceiling; SDK retries are
disabled and each request times out after 60 seconds. Only `end_turn` responses
are parsed. Valid rows survive a retry; invalid/missing descriptions remain
null. City guards apply to all groups, and inspection descriptions cannot make
opening or operating claims. Prompts use only the supplied name, address and
city; unstated brand/menu details and speculative business-type alternatives
are excluded. Hedged alternatives are rejected rather than published as facts.
The final type-description check also drops modifiers absent from the permit
name; unsupported brand knowledge cannot become a published permit fact.

The October 21 repair probe reproduced the previous 1,024-token request ending
with `stop_reason: max_tokens`: 760 tokens went to thinking and its JSON text
was unfinished. [Anthropic's structured output documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
also requires handling incomplete output when the token limit is reached.

Each request logs its stop reason, output tokens, coverage and diagnostic path.
Diagnostics live privately at
`~/.local/state/sbt-food-openings/blurb-diagnostics/`; rejected responses retain
their exact model content there, outside Git and public artifacts.

Focused offline checks:

```sh
node --test scripts/lib/scc-food-generation.test.mjs scripts/lib/scc-food-openings.test.mjs
```

After merging source changes, fast-forward the Mini under its existing repo
mutex before running the generator. Keep the mutex through publication of the
generated JSON. Merging a PR alone does not update the Mini's installed source.
