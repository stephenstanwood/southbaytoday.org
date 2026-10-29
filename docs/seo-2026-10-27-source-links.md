# October 27, 2026: organizer links and attendance details

The weekly combined SEO and product review found two future newsletter-derived
events with empty source URLs. These repairs preserve their titles, dates,
times, IDs, and public SBT URLs. Raw inbound evidence and generation timestamps
remain unchanged. `applyVerifiedEventFacts` reapplies the corrections during
normal generation so the next refresh retains them.

## AfterHours: Witches & Warlocks — October 30

The City of Mountain View's live registration search linked to its
[exact activity page](https://anc.apm.activecommunities.com/mountainviewrecreation/activity/search/detail/19451?onlineSiteId=0&from_original_cui=true).
Browser verification on October 27 confirmed activity #24499 on October 30,
6–8 p.m., at The View Teen Center, 263 Escuela Avenue. The program is free and
restricted to Mountain View and Los Altos students in grades 6–12 with a free
Teen Center membership. The page showed the session full, with waiting-list
registration open. The visible attendance note dates that availability check
and directs readers to the organizer for current status.

Restore the primary link, free admission, the existing `kids` audience value
used for teen-only programs, and attendance restrictions. Preserve unknown
facts outside that evidence. The prior all-audience record could enter adult
plans and did not give readers a way to verify eligibility or availability.

## Evacuation Planning Community Listening Session — November 5

The Town of Los Gatos' live
[Emergency Preparedness page](https://losgatosca.gov/2026/Emergency-Preparedness#evacuation-listening-session)
confirmed November 5 at 6 p.m. Pacific, Council Chambers at 110 E. Main St.,
remote attendance via its Zoom link, and no registration requirement. Restore
the organizer link and participation instructions; leave admission cost
unknown. The web search snapshot contained the event, but an older text fetch
omitted it. The live browser page supplied the current proof.

## Remaining gaps

Eleven source-less records were present before these repairs (including one
past occurrence). The Sunnyvale Repair Café URL found in a third-party listing
returned `Not found` in the browser, so it was not used. Other gaps remain
warnings until their exact first-party occurrence is verified. Do not invent
links, borrow another occurrence's page, or add optional schema fields without
source evidence.

## Discovery audit agrees with the source-confirmation safeguard

The full build audit initially failed on 13 future listings already marked
`attendanceStatus: needs-confirmation`. Their organizers publish conflicting
dates, clocks, or venues. The existing schema mapper correctly omits a
scheduled Event for those records, and their pages display a confirmation
note. The audit incorrectly required an Event for every future listing.

The event page now marks that existing status and its visible note in HTML.
The audit accepts zero Event objects only for that explicit state, requires
the reader-facing explanation, and rejects Event markup that would advertise
the conflicting attendance as confirmed. Ordinary future occurrences still
require exactly one Event. The CLI regression fixture exercises all four
cases without changing the source facts or indexing policy.

## Newsletter publication gap

The live archive and newsletter sitemap both ended with October 25. The Mini's
existing sender log established why October 26 was missing: at
`2026-10-26T10:50:02.466Z`, its single scheduled attempt encountered
`sbs-copy-edit` holding the shared repo lock for 12 minutes, then stopped before
preflight or sending.

The existing sender now reuses the already-tested bounded lock waiter: retry
once a minute for at most 20 minutes, then run the unchanged freshness preflight
only after it acquires the mutex. It still stops on persistent contention,
helper failure, or unsafe checkout state; it never releases another owner's
lock. `SBT_NEWSLETTER_LOCK_WAIT_MS` may shorten or disable the wait, with a
20-minute maximum. CLI fixture tests verify recovery followed by a fresh
preflight, timeout without preflight/send/release, and immediate failure for a
broken lock helper. No schedule was changed and no issue was sent or resent.


## October 29 recovery

The October 27 observations above retain their original dates. Recovery used
an isolated worktree prepared from `0b939964420502117a192c1c80d4b7b74ee15b0f`,
after the independent event refresh completed. Its 1,444-event snapshot and
`2026-10-29T22:13:58.306Z` generation timestamp were preserved; only the two
exact future occurrences received the verified fact deltas. Later source
corrections and the completed PR318 runtime repair were retained.

The original newsletter fixture used a 10ms deadline that could expire while
spawning the shell helper. The positive CLI case now gives process startup a
five-second budget; refusal and helper-error cases use a deterministic zero
budget. The existing fake-clock suite still checks the complete 20-minute
wait and one-minute retries. A separate Mini-only integration used the actual
installed mutex against a private fixture: a competing owner was preserved,
then its release allowed a fresh checkout preflight. No sender was invoked.

Full validation also exposed an unrelated pre-existing theatre test failure:
its moving future date crossed the November daylight-saving boundary while
the fixture kept a summer UTC offset. The fixture now uses the existing
Pacific wall-clock converter. Production theatre parsing and source facts
were unchanged.

Narrow organizer rechecks on October 29 confirmed both exact occurrences still
matched the recovered facts. The teen activity remained full with waitlist
registration; the evacuation session still listed November 5 at 6 p.m., Council
Chambers, Zoom participation, and no registration requirement. The attendance
note retains the original October 27 observation date.

The new Mini browser profile on October 29 exposed only `stephen@stoa.works`
in Google's expanded account picker. The exact SBT property denied that account
access; Add another account led to the sign-in form. No credentials were
entered and no account settings changed. The successful October 27 GSC audit
and identity proof remain dated October 27. Fresh post-publication inspection
under `stanwoodventures@gmail.com` requires that account's Mini-local login;
no GSC mutation has been performed.
