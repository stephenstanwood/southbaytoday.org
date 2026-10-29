import test from "node:test";
import assert from "node:assert/strict";
import * as copy from "./copy-gen.mjs";

test("every social copy entry point stops before credentials or a paid request", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw Error("unexpected network request"); };
  try {
    for (const [name, generate] of Object.entries(copy)) {
      if (name.startsWith("generate")) await assert.rejects(generate({}), /social copy generation is retired/, name);
    }
  } finally { globalThis.fetch = previous; }
});
