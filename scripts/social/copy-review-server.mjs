#!/usr/bin/env node
// ---------------------------------------------------------------------------
// South Bay Signal — Social Copy Review Server
// Swipe left/right to approve/reject post variants
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = 3456;
const REVIEW_FILE = "/tmp/sbs-social-review.json";
const RESULTS_FILE = "/tmp/sbs-social-review-results.json";

let variants = JSON.parse(readFileSync(REVIEW_FILE, "utf8"));
let results = [];

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SBS Social Copy Review</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #FAF9F6;
    color: #1A1A1A;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 40px 20px;
  }
  h1 {
    font-size: 14px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 8px;
  }
  .counter {
    font-size: 13px;
    color: #aaa;
    margin-bottom: 32px;
  }
  .card {
    background: #fff;
    border: 1px solid #E5E2DB;
    border-radius: 8px;
    padding: 32px;
    max-width: 540px;
    width: 100%;
    margin-bottom: 24px;
    position: relative;
    transition: transform 0.3s, opacity 0.3s;
  }
  .card.swipe-left { transform: translateX(-120%) rotate(-8deg); opacity: 0; }
  .card.swipe-right { transform: translateX(120%) rotate(8deg); opacity: 0; }
  .format-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 3px;
    margin-bottom: 16px;
  }
  .format-pulse { background: #f0efec; color: #1a1a1a; }
  .format-tonight { background: #fdeeec; color: #c0392b; }
  .format-weekend { background: #e8f5e9; color: #2c6b4f; }
  .format-civic { background: #e3f2fd; color: #2b5c8c; }
  .format-lead { background: #f0efec; color: #1a1a1a; }
  .format-themed { background: #f3e8fd; color: #6b2fa0; }
  .format-family { background: #fff3e0; color: #e65100; }
  .format-arts { background: #f3e8fd; color: #6b2fa0; }
  .format-sports { background: #e8f5e9; color: #2c6b4f; }
  .format-food { background: #fff8e1; color: #f57f17; }
  [class*="format-family"] { background: #fff3e0; color: #e65100; }
  [class*="format-arts"] { background: #f3e8fd; color: #6b2fa0; }
  [class*="format-sports"] { background: #e8f5e9; color: #2c6b4f; }
  [class*="format-civic"] { background: #e3f2fd; color: #2b5c8c; }
  [class*="format-food"] { background: #fff8e1; color: #f57f17; }
  .vibe {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 12px;
    font-style: italic;
  }
  .tweet-text {
    font-size: 18px;
    line-height: 1.5;
    color: #1a1a1a;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .tweet-text a { color: #1d9bf0; text-decoration: none; }
  .char-count {
    font-size: 12px;
    color: #aaa;
    margin-top: 12px;
    text-align: right;
  }
  .buttons {
    display: flex;
    gap: 16px;
    max-width: 540px;
    width: 100%;
  }
  .btn {
    flex: 1;
    padding: 16px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .btn:active { transform: scale(0.96); }
  .btn-reject {
    background: #f5f5f5;
    color: #888;
    border: 1px solid #ddd;
  }
  .btn-approve {
    background: #1a1a1a;
    color: #faf9f6;
  }
  .btn-approve:hover { background: #333; }
  .done {
    text-align: center;
    padding: 60px 20px;
    max-width: 540px;
  }
  .done h2 { font-size: 24px; margin-bottom: 16px; }
  .done p { color: #888; line-height: 1.6; }
  .results { margin-top: 24px; text-align: left; }
  .results li {
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    font-size: 14px;
    list-style: none;
  }
  .results .approved { color: #2c6b4f; }
  .results .rejected { color: #c0392b; }
  kbd {
    display: inline-block;
    background: #eee;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 12px;
    margin: 0 2px;
  }
  .shortcuts {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 20px;
  }
</style>
</head>
<body>
<h1>Social Copy Review</h1>
<div class="counter" id="counter"></div>
<div class="shortcuts"><kbd>&larr;</kbd> reject &nbsp; <kbd>&rarr;</kbd> approve</div>
<div class="card" id="card"></div>
<div class="buttons" id="buttons">
  <button class="btn btn-reject" onclick="vote('reject')">&larr; Nah</button>
  <button class="btn btn-approve" onclick="vote('approve')">This works &rarr;</button>
</div>
<div class="done" id="done" style="display:none"></div>

<script>
let variants = VARIANTS_PLACEHOLDER;
let current = 0;
let results = [];

function render() {
  if (current >= variants.length) {
    document.getElementById('card').style.display = 'none';
    document.getElementById('buttons').style.display = 'none';
    const approved = results.filter(r => r.vote === 'approve');
    const rejected = results.filter(r => r.vote === 'reject');
    let html = '<h2>Done!</h2>';
    html += '<p>' + approved.length + ' approved, ' + rejected.length + ' rejected</p>';
    if (approved.length > 0) {
      html += '<div class="results"><strong>Approved:</strong><ul>';
      approved.forEach(r => {
        html += '<li class="approved">[' + r.format + '/' + r.vibe + '] ' + r.text.slice(0, 80) + '...</li>';
      });
      html += '</ul></div>';
    }
    document.getElementById('done').style.display = 'block';
    document.getElementById('done').innerHTML = html;
    // Save results
    fetch('/results', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(results) });
    return;
  }
  const v = variants[current];
  document.getElementById('counter').textContent = (current + 1) + ' / ' + variants.length;
  const urlified = v.text.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1">$1</a>');
  document.getElementById('card').innerHTML =
    '<div class="format-badge format-' + (v.format || v.approach || 'pulse') + '">' + (v.format || (v.approach === 'themed' ? v.theme : v.approach) || 'pulse').toUpperCase() + '</div>' +
    '<div class="vibe">' + v.vibe + '</div>' +
    '<div class="tweet-text">' + urlified + '</div>' +
    '<div class="char-count">' + v.text.length + ' / 280</div>';
  document.getElementById('card').className = 'card';
}

function vote(v) {
  const card = document.getElementById('card');
  card.classList.add(v === 'approve' ? 'swipe-right' : 'swipe-left');
  results.push({ ...variants[current], vote: v });
  setTimeout(() => { current++; render(); }, 300);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') vote('approve');
  if (e.key === 'ArrowLeft') vote('reject');
});

render();
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/results") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      results = JSON.parse(body);
      writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2) + "\n");
      console.log(`\n✅ Review complete!`);
      const approved = results.filter((r) => r.vote === "approve");
      const rejected = results.filter((r) => r.vote === "reject");
      console.log(`  Approved: ${approved.length}`);
      console.log(`  Rejected: ${rejected.length}`);
      if (approved.length > 0) {
        console.log(`\n  Approved variants:`);
        approved.forEach((r) => console.log(`    [${r.format}/${r.vibe}] ${r.text.slice(0, 80)}...`));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  const page = HTML.replace(
    "VARIANTS_PLACEHOLDER",
    JSON.stringify(variants)
  );
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(page);
});

server.listen(PORT, () => {
  console.log(`\n🗳️  Social Copy Review: http://localhost:${PORT}`);
  console.log(`   ${variants.length} variants to review`);
  console.log(`   ← reject  |  approve →\n`);
});
