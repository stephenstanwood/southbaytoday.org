#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Today — Pinterest OAuth Helper
//
// One-shot CLI Stephen runs ONCE on his laptop after trial access is approved
// and the App Secret is available. Flow:
//
//   1. Reads PINTEREST_APP_ID + PINTEREST_APP_SECRET from .env.local (or
//      accepts them via CLI flags if .env.local is on the Mini, not here).
//   2. Spins up a local HTTP server on port 8765 (must match the
//      Redirect URI configured at developers.pinterest.com).
//   3. Opens the Pinterest authorization page in his browser with the right
//      scopes for our use case (pins:write, boards:write, pins:read, boards:read).
//   4. Catches the redirect, exchanges the code for access_token + refresh_token.
//   5. Prints both tokens — Stephen pastes them into the session, I drop them
//      into .env.local on the Mini.
//
// One run only. After that, refresh-pinterest-token.mjs handles renewals.
// ---------------------------------------------------------------------------

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ["pins:read", "pins:write", "boards:read", "boards:write", "user_accounts:read"];

// CLI args (override env)
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}

function loadEnv() {
  try {
    const envPath = join(__dirname, "..", "..", ".env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}
loadEnv();

const appId = flag("app-id") || process.env.PINTEREST_APP_ID;
const appSecret = flag("app-secret") || process.env.PINTEREST_APP_SECRET;

if (!appId || !appSecret) {
  console.error(`
ERROR: missing app credentials.

Either set them in .env.local:
  PINTEREST_APP_ID=...
  PINTEREST_APP_SECRET=...

Or pass via flags:
  node scripts/social/oauth-pinterest.mjs --app-id 1570770 --app-secret <secret>
`);
  process.exit(1);
}

const authUrl = new URL("https://www.pinterest.com/oauth/");
authUrl.searchParams.set("client_id", appId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES.join(","));
authUrl.searchParams.set("state", `sbt-${Date.now()}`);

console.log(`\n[oauth-pinterest] opening authorization page in your browser…\n`);
console.log(`If it doesn't open, paste this URL manually:\n  ${authUrl.toString()}\n`);

// Open in default browser (macOS / Linux / Windows)
const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
try {
  spawn(openCmd, [authUrl.toString()], { detached: true, stdio: "ignore" }).unref();
} catch (err) {
  console.warn(`Couldn't auto-open browser: ${err.message}`);
}

// Spin up the callback listener
const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404).end("Not found");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Authorization error</h1><p>${error}: ${url.searchParams.get("error_description") || ""}</p>`);
    console.error(`\n❌ Authorization error: ${error}`);
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400).end("Missing code");
    return;
  }

  // Exchange code for tokens
  try {
    const basic = Buffer.from(`${appId}:${appSecret}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });
    const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h1>Token exchange failed</h1><pre>${text.replace(/</g, "&lt;")}</pre>`);
      console.error(`\n❌ Token exchange failed (${tokenRes.status}):`, text);
      process.exit(1);
    }

    const data = await tokenRes.json();

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
<!doctype html>
<title>Pinterest OAuth — done</title>
<style>body{font-family:system-ui;max-width:480px;margin:6rem auto;padding:0 1rem}</style>
<h1>✅ Tokens received</h1>
<p>Check the terminal output. You can close this tab.</p>
`);

    console.log(`\n✅ Tokens received\n`);
    console.log(`access_token:  ${data.access_token}`);
    console.log(`refresh_token: ${data.refresh_token}`);
    console.log(`expires_in:    ${data.expires_in}s (${Math.round(data.expires_in / 86400)} days)`);
    console.log(`scope:         ${data.scope}`);
    console.log(`\nPaste both tokens (and the app secret if you haven't already) into the session and I'll wire them up.\n`);

    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error(`\n❌ Token exchange threw: ${err.message}`);
    res.writeHead(500).end(`Token exchange threw: ${err.message}`);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`[oauth-pinterest] listening on http://localhost:${PORT}/callback`);
  console.log(`[oauth-pinterest] click Allow in the browser tab. Waiting…\n`);
});
