# Email DNS and DMARC

Last verified: 2026-07-23

Vercel DNS is authoritative for `southbaytoday.org`. This runbook records the
intended mail layout; `npm run verify:email-dns` checks the public records
without requiring Vercel, ImprovMX, Resend, SES, or Postmark credentials.

## Service layout

| DNS zone | Purpose | Provider |
| --- | --- | --- |
| `southbaytoday.org` | Inbound forwarding to Stephen | ImprovMX |
| `send.southbaytoday.org` | Newsletter and transactional bounce processing | Resend / Amazon SES |
| `in.southbaytoday.org` | Lookout inbound webhook mail | Resend inbound |
| `send.in.southbaytoday.org` | Lookout outbound bounce processing | Resend / Amazon SES |

The apex MX and SPF records belong to ImprovMX. Resend rewrites outbound
Return-Path addresses to `send.southbaytoday.org`, where SES has its own MX and
SPF records. Do not move either provider's records onto the other zone.

## Enforced DMARC policy

The required public record is:

```text
_dmarc.southbaytoday.org TXT "v=DMARC1; p=reject; pct=100; adkim=r; aspf=r; rua=mailto:re+cb1ziolsaqi@dmarc.postmarkapp.com"
```

`p=reject`, `pct=100`, `adkim=r`, and `aspf=r` are hard requirements. They
protect the domain and keep Apple Business Connect Branded Mail eligible. An
analyzer migration may replace only the `rua` destination unless a separate,
explicit authentication review approves another change.

## Aggregate-report analyzer

Raw aggregate XML no longer goes to `stephen@southbaytoday.org`. It goes to
[Postmark's free DMARC monitor](https://dmarc.postmarkapp.com/), which converts
the reports into one human-readable weekly digest sent to that address.

This route was chosen because it has no account, password, payment method, or
new recurring spend. Postmark assigns a unique reporting address, processes the
aggregate reports, and sends a digest only when it received report data during
the week. Its free service is email-only and retains report metadata for two
weeks; those limits are appropriate for this low-volume domain. See Postmark's
[free-tool FAQ](https://postmarkapp.com/support/article/1088-dmarc-reporting-tool-faq).

The private Postmark API token is not stored in Git. If API access is needed,
recover it through Postmark using the public reporting address above; the
recovery email goes to `stephen@southbaytoday.org`.

Postmark confirmed the monitor registration by delivering the welcome/setup
message `DMARC reports for southbaytoday.org` to the registered digest inbox
(mail thread `19f9013b2e2409c9`). A separate token-recovery message was also
delivered (mail thread `19f9017af5d23c76`), proving the recovery path works;
its reset link was intentionally left unused because routine report delivery
does not need API access or a token rotation.

Because the aggregate destination is on another organizational domain, DMARC
receivers also check this Postmark authorization record:

```text
southbaytoday.org._report._dmarc.dmarc.postmarkapp.com TXT "v=DMARC1;"
```

Do not add Stephen's address as a second `rua`: that would restart delivery of
the raw reports to the human inbox.

A receiver that cached the previous record may send one final raw report after
the rotation. Treat raw reports whose reporting window starts more than 48
hours after this change as drift and rerun the verifier.

## Change procedure

1. Register and verify the replacement analyzer before changing `rua`.
2. Read the current Vercel record ID with `vercel dns ls southbaytoday.org`.
3. PATCH the existing record through Vercel's DNS API. Do not delete and
   recreate it, which creates an avoidable interval with no DMARC policy.
4. Run `npm run verify:email-dns`.
5. Confirm the analyzer reports the DNS record as verified. Aggregate data can
   take 24–48 hours to arrive because mailbox providers send reports on their
   own cadence.

If Postmark retires the free monitor, choose and verify a replacement analyzer
before rotating `rua`. Never solve analyzer trouble by weakening or removing
the enforcement tags.

## 2026-07-23 verification evidence

- Vercel record: `rec_2983d4e90f91d1752e7757ed`
- Authoritative nameservers: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`
- Public DMARC lookup: exact enforced record shown above from both
  `1.1.1.1` and `8.8.8.8`
- External report authorization: `v=DMARC1;` from both public resolvers
- Postmark registration: welcome/setup message delivered to the registered
  digest inbox (`19f9013b2e2409c9`)
- Token recovery: recovery message delivered (`19f9017af5d23c76`); reset link
  not used because no token is needed for report delivery
- Apex inbound: ImprovMX MX and SPF unchanged
- Resend / SES bounce, DKIM, and Lookout inbound records unchanged
- Local verifier: `npm run verify:email-dns`
