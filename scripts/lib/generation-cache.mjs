import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const generationKey = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Content-addressed, host-local recovery cache. Include the complete prompt,
// model and output contract in input. Store only successfully validated output.
export async function cachedGeneration({ namespace, input, generate, validate = () => true,
  root = process.env.SBT_GENERATION_CACHE_DIR || join(homedir(), ".cache/southbaytoday/generation"),
  ttlMs = 30 * 86400_000, onHit = () => {} }) {
  const key = generationKey(input);
  const path = join(root, namespace, `${key}.json`);
  try {
    const saved = JSON.parse(readFileSync(path, "utf8"));
    if (saved.key === key && Date.now() - saved.at < ttlMs && validate(saved.value)) {
      onHit(key);
      return saved.value;
    }
  } catch { /* Missing/stale/invalid cache is a normal miss. */ }
  const value = await generate();
  if (!validate(value)) throw new Error(`${namespace}: generated result failed validation`);
  mkdirSync(join(root, namespace), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ key, at: Date.now(), value }), { mode: 0o600 });
  renameSync(temporary, path);
  return value;
}
