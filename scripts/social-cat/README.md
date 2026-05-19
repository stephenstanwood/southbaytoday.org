# social-cat

Trend radar + drafting LLM that proposes social posts to a Discord queue
(`#social` in stanwood.dev) for thumbs-up approval. Built for South Bay Today
(SBT) primarily; the same trend feed also seeds outbox.cafe's autonomous
generation.

Lives on the Mac Mini, runs on cron.

## Pipeline

```
radar.py        →  data/trends_raw.jsonl      (fetched items from Reddit,
                                                HN, BuzzFeed, Mashable)
draft.py        →  data/drafts.jsonl          (LLM-generated platform drafts,
                                                status='queued')
post_to_social  →  Discord #social            (one message per draft,
                                                status flips to 'posted',
                                                message_id captured)
```

## Layout

```
scripts/
  radar.py           # multi-source fetcher (stdlib only)
  draft.py           # local claude CLI → platform drafts JSON
  post_to_social.py  # webhook poster
  run-on-mini.sh     # cron entrypoint, single-flight lock, env sourcing
data/
  trends_raw.jsonl   # latest fetch (overwritten each run)
  drafts.jsonl       # rolling history of drafts + statuses
```

## V1 scope (this session)

- Reddit r/popular + HN + BuzzFeed + Mashable
- 2 platforms drafted per trend: twitter + bluesky
- 5 trends per cycle
- Posts queued in #social with `🐦 Twitter` / `🦋 Bluesky` headers + source links
- Cron: every 3h

## V2 (next sessions)

- Reaction listener (poll for 👍 → fire actual platform post, react ✅ on source)
- Wire SBT platform creds (need from Stephen: which accounts)
- outbox.cafe ingestion: outbox-cafe/generate.py reads trends_raw.jsonl
- More sources: Know Your Meme, local subreddits (r/bayarea, r/sanjose)
- Edit-before-post flow (reply with edited text + emoji marker)

## Env

`.env` (Mini-only; not in git):

```
SOCIAL_WEBHOOK=https://discord.com/api/webhooks/.../...
```

Claude OAuth is sourced from `~/Projects/mini-claude-proxy/.env` (shared with outbox-cafe).
