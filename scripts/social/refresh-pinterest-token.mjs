#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Pinterest Token Refresher
//
// Pinterest OAuth 2.0:
//   access_token  expires every 30 days
//   refresh_token expires every 365 days
//
// Run every 25 days via launchd to keep the access token fresh well inside
// the 30-day window. If the refresh token itself is close to expiry we
// surface that loudly — Stephen has to re-authorize at the developer
// portal to get a new refresh token (no programmatic path).
//
// Usage: node scripts/social/refresh-pinterest-token.mjs [--dry-run]
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, "..", "..", ".env.local");
const dryRun = process.argv.includes("--dry-run");

function loadEnv() {
  const text = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function updateEnvValue(key, newValue) {
  const text = readFileSync(ENV_PATH, "utf8");
  const re = new RegExp(`^(${key})=.*$`, "m");
  if (!re.test(text)) {
    // Append a new line if the key doesn't exist yet (first-time refresh
    // after the manual token drop).
    writeFileSync(ENV_PATH, text + (text.endsWith("\n") ? "" : "\n") + `${key}="${newValue}"\n`, "utf8");
    return;
  }
  writeFileSync(ENV_PATH, text.replace(re, `$1="${newValue}"`), "utf8");
}

async function main() {
  const env = loadEnv();
  const refreshToken = env.PINTEREST_REFRESH_TOKEN;
  const clientId = env.PINTEREST_APP_ID;
  const clientSecret = env.PINTEREST_APP_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    console.error("ERROR: missing one of PINTEREST_REFRESH_TOKEN / PINTEREST_APP_ID / PINTEREST_APP_SECRET in .env.local");
    process.exit(1);
  }

  console.log(`[pinterest-refresh] using refresh token: ...${refreshToken.slice(-8)}`);

  if (dryRun) {
    console.log("[pinterest-refresh] dry run — skipping API call");
    return;
  }

  // Pinterest's OAuth refresh endpoint uses Basic auth with client_id:secret,
  // body in application/x-www-form-urlencoded.
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`ERROR: refresh failed (${res.status}): ${text}`);
    // Loud alert: this is the recoverable-only-by-Stephen case
    try {
      const { catSignal } = await import("../lib/notify.mjs");
      await catSignal({
        key: `pinterest-refresh-fail-${new Date().toISOString().slice(0, 10)}`,
        title: "🚨 Pinterest token refresh failed",
        body: `Status ${res.status}. You'll need to re-authorize via the developer portal and drop new tokens.\n\n\`${text.slice(0, 300)}\``,
      });
    } catch {}
    process.exit(1);
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token; // may or may not be rotated
  const expiresIn = data.expires_in;

  if (!newAccessToken) {
    console.error("ERROR: no access_token in response", data);
    process.exit(1);
  }

  updateEnvValue("PINTEREST_ACCESS_TOKEN", newAccessToken);
  if (newRefreshToken && newRefreshToken !== refreshToken) {
    updateEnvValue("PINTEREST_REFRESH_TOKEN", newRefreshToken);
    console.log(`[pinterest-refresh] refresh token rotated`);
  }

  const expiryDate = new Date(Date.now() + expiresIn * 1000);
  console.log(`[pinterest-refresh] access token refreshed`);
  console.log(`[pinterest-refresh] new token: ...${newAccessToken.slice(-8)}`);
  console.log(`[pinterest-refresh] expires in ${Math.round(expiresIn / 86400)} days (${expiryDate.toISOString()})`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
