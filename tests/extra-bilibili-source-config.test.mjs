import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/extra-bilibili-source-config.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function getConfig() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.extraBilibiliSourceConfig;
}

test("parses valid extra Bilibili source settings", () => {
  const config = getConfig();
  const source = config.parse({
    enabled: true,
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
    offsetSeconds: -30,
  });
  assert.equal(source.enabled, true);
  assert.equal(source.url, "https://www.bilibili.com/video/BV1xx411c7mD");
  assert.equal(source.offsetSeconds, -30);
  assert.equal(config.hasSettings(source), true);
  assert.equal(config.storageKey(42), "extraBilibiliSource:42");
});

test("restores stored settings disabled or persists a populated live source", () => {
  const config = getConfig();
  const stored = {
    enabled: true,
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
    offsetSeconds: 15,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(config.resolve(null, stored))), {
    restore: { ...stored, enabled: false },
    persist: null,
  });
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(config.resolve({ ...stored, enabled: false }, stored)),
    ),
    {
      restore: null,
      persist: { ...stored, enabled: false },
    },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(config.resolve(null, null))), {
    restore: null,
    persist: null,
  });
});

test("rejects malformed or out-of-range source settings", () => {
  const config = getConfig();
  assert.equal(config.parse(null), null);
  assert.equal(
    config.parse({ enabled: true, url: "", offsetSeconds: 3601 }),
    null,
  );
  assert.equal(
    config.parse({ enabled: true, url: "x".repeat(2049), offsetSeconds: 0 }),
    null,
  );
  assert.equal(
    config.hasSettings({ enabled: false, url: "", offsetSeconds: 0 }),
    false,
  );
});
