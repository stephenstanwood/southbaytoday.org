// Included Claude CLI usage must not inherit Console/cloud API authentication.
// The explicit API fallback retains the parent's credentials in its own process.
export function claudeSubscriptionEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"]) delete env[key];
  return env;
}
