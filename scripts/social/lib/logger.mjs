// ---------------------------------------------------------------------------
// South Bay Signal — Social Posting Logger
// ---------------------------------------------------------------------------

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function log(msg) {
  console.log(msg);
}

export function logStep(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

export function logItem(msg) {
  console.log(`  ${DIM}•${RESET} ${msg}`);
}

export function logScore(title, score) {
  console.log(`  ${DIM}•${RESET} ${title} ${DIM}(${score.toFixed(1)})${RESET}`);
}

export function logSuccess(msg) {
  console.log(`${BOLD}✅ ${msg}${RESET}`);
}

export function logSkip(msg) {
  console.log(`⏭️  ${msg}`);
}

export function logError(msg) {
  console.error(`❌ ${msg}`);
}

export function logDryRun(msg) {
  console.log(`🔸 [DRY RUN] ${msg}`);
}

export function logPublish(platform, msg) {
  console.log(`📤 [${platform.toUpperCase()}] ${msg}`);
}
