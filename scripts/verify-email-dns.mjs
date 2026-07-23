#!/usr/bin/env node

import { resolveMx, resolveTxt } from "node:dns/promises";

const DOMAIN = "southbaytoday.org";
const DMARC_NAME = `_dmarc.${DOMAIN}`;
const POSTMARK_RUA = "re+cb1ziolsaqi@dmarc.postmarkapp.com";
const EXPECTED_DMARC = [
  "v=DMARC1",
  "p=reject",
  "pct=100",
  "adkim=r",
  "aspf=r",
  `rua=mailto:${POSTMARK_RUA}`,
].join("; ");

function fail(message) {
  throw new Error(`email DNS verification failed: ${message}`);
}

function normalizeHost(host) {
  return host.toLowerCase().replace(/\.$/, "");
}

function joinTxt(records) {
  return records.map((chunks) => chunks.join(""));
}

async function txt(name) {
  try {
    return joinTxt(await resolveTxt(name));
  } catch (error) {
    fail(`${name} TXT lookup failed (${error.code ?? error.message})`);
  }
}

async function mx(name) {
  try {
    return (await resolveMx(name))
      .map(({ exchange, priority }) => ({
        exchange: normalizeHost(exchange),
        priority,
      }))
      .sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange));
  } catch (error) {
    fail(`${name} MX lookup failed (${error.code ?? error.message})`);
  }
}

function requireSingleTxt(records, expected, name) {
  if (records.length !== 1 || records[0] !== expected) {
    fail(`${name} expected one exact record ${JSON.stringify(expected)}, got ${JSON.stringify(records)}`);
  }
}

function requireMx(records, expected, name) {
  const actual = JSON.stringify(records);
  const wanted = JSON.stringify(expected);
  if (actual !== wanted) {
    fail(`${name} expected ${wanted}, got ${actual}`);
  }
}

const dmarcRecords = await txt(DMARC_NAME);
requireSingleTxt(dmarcRecords, EXPECTED_DMARC, DMARC_NAME);

const reportDestination = POSTMARK_RUA.slice(POSTMARK_RUA.lastIndexOf("@") + 1);
const externalAuthorizationName = `${DOMAIN}._report._dmarc.${reportDestination}`;
const externalAuthorization = await txt(externalAuthorizationName);
if (!externalAuthorization.some((record) => /^v=DMARC1(?:;|$)/i.test(record))) {
  fail(
    `${externalAuthorizationName} does not authorize aggregate reports: ${JSON.stringify(externalAuthorization)}`,
  );
}

requireMx(
  await mx(DOMAIN),
  [
    { exchange: "mx1.improvmx.com", priority: 10 },
    { exchange: "mx2.improvmx.com", priority: 20 },
  ],
  `${DOMAIN} inbound`,
);
requireSingleTxt(
  (await txt(DOMAIN)).filter((record) => record.startsWith("v=spf1")),
  "v=spf1 include:spf.improvmx.com ~all",
  `${DOMAIN} SPF`,
);

requireMx(
  await mx(`send.${DOMAIN}`),
  [{ exchange: "feedback-smtp.us-east-1.amazonses.com", priority: 10 }],
  `send.${DOMAIN}`,
);
requireSingleTxt(
  (await txt(`send.${DOMAIN}`)).filter((record) => record.startsWith("v=spf1")),
  "v=spf1 include:amazonses.com ~all",
  `send.${DOMAIN} SPF`,
);

const resendDkim = await txt(`resend._domainkey.${DOMAIN}`);
if (resendDkim.length !== 1 || !/^p=[A-Za-z0-9+/=]+$/.test(resendDkim[0])) {
  fail(`resend._domainkey.${DOMAIN} DKIM key is missing or malformed`);
}

requireMx(
  await mx(`in.${DOMAIN}`),
  [{ exchange: "inbound-smtp.us-east-1.amazonaws.com", priority: 10 }],
  `in.${DOMAIN}`,
);
requireMx(
  await mx(`send.in.${DOMAIN}`),
  [{ exchange: "feedback-smtp.us-east-1.amazonses.com", priority: 10 }],
  `send.in.${DOMAIN}`,
);
requireSingleTxt(
  (await txt(`send.in.${DOMAIN}`)).filter((record) => record.startsWith("v=spf1")),
  "v=spf1 include:amazonses.com ~all",
  `send.in.${DOMAIN} SPF`,
);

console.log("Email DNS verification PASS");
console.log(`DMARC: ${EXPECTED_DMARC}`);
console.log(`Analyzer authorization: ${externalAuthorizationName} → ${externalAuthorization.join(", ")}`);
console.log("Mail topology: ImprovMX inbound; Resend/SES outbound and Lookout inbound unchanged");
