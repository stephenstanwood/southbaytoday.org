# Reddit source retirement — October 19, 2026

Stephen authorized finding a permitted refresh route and taking down the Reddit
section if none was usable, then shipping and wrapping the result.

## Access decision

The existing integration fetched public subreddit RSS and classified the results
for an off-site local discovery feed. No Reddit API credentials were configured
on the authoritative Mini, and no approved access grant was established.

- [Reddit's October 8, 2026 changelog](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026)
  announces that RSS support ends November 13, 2026, with no replacement for feeds
  outside a community the operator moderates. It also announces the public API
  migration, including the October 31 cutoff for new public API requests.
- [Developer Platform and Accessing Reddit Data](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data)
  requires permission for business/commercial use and a contract. Devvit serves
  apps on Reddit; embeds display selected posts rather than supplying this feed.
- [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
  requires explicit approval for API access and forbids bypassing access limits.
- [Reddit's June 25, 2024 crawler announcement](https://redditinc.com/news/robot-txt-update)
  shows that the broader crawler restrictions are older than the RSS sunset.
  The current public robots.txt disallows all paths for unidentified crawlers.

An approved, contracted data integration remains a theoretical future option; it
is not an available unattended replacement for this retired source. Do not
restore anonymous RSS/JSON fetching, spoof user agents, proxy scraping through
another service, or use moderator access for an off-site feed.

## Retired surfaces and callers

- Removed The Conversation tiles from the homepage and all city pages. City
  island props no longer import or serialize Reddit posts.
- Current newsletter assembly no longer loads Reddit, and newly rendered email
  and digest bodies omit the section even if an old draft contains posts.
  Sent issue HTML in Blob and the newsletter archive handler remain unchanged.
- The old refresh and Google Places backfill entry points are harmless no-ops:
  they load no environment, make no requests and write no data. This also protects
  any stale local caller until its installed instructions are updated.
- Removed Reddit from the secondary openings scan and watchdog process list.
- On the Mini, remove only the Reddit generator step from the existing
  `~/.claude/scheduled-tasks/southbaysignal-data-refresh/SKILL.md`. Preserve its
  other generators, mutex, publication guards, recovery state and schedule.
- Replace the legacy `~/.claude/scheduled-tasks/sbs-reddit-pulse/run.sh` with a
  harmless retired wrapper. No matching Reddit cron or LaunchAgent was installed
  when this retirement was inspected; do not create a replacement timer.

The last committed JSON remains as historical input, without current consumers.
No new data or freshness timestamps were fabricated. Retired implementation is
available in the parent commit before this change; shared Recraft generation and
its quiet credit-outage notification remain active for other uses.

## Reintroduction

First establish explicit permission for the intended off-site use and its
retention/display requirements. Then implement that approved contract, restore
only the appropriate consumers, and prove a real refresh and live publication.
The previous RSS implementation is not a permitted restore path.
