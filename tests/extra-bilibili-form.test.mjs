import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/popup/extra-bilibili-form.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function parse(url, offset, enabled = true) {
  const context = { PipCompanion: {}, URL };
  vm.runInNewContext(source, context);
  return context.PipCompanion.extraBilibiliForm.parse(
    url,
    offset,
    enabled,
    (value) => value.startsWith("https://www.bilibili.com/video/"),
  );
}

test("normalizes valid source values and disables an empty URL", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(parse(" https://www.bilibili.com/video/BV123 ", "-4.5")),
    ),
    {
      ok: true,
      source: {
        enabled: true,
        url: "https://www.bilibili.com/video/BV123",
        offsetSeconds: -4.5,
      },
    },
  );
  assert.equal(parse("", "0").source.enabled, false);
});

test("reports invalid URL or out-of-range offset with existing fallback values", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(parse("https://example.com", "12"))),
    {
      ok: false,
      errorField: "url",
      url: "https://example.com",
      offsetSeconds: 12,
    },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(parse("", "3601"))), {
    ok: false,
    errorField: "offset",
    url: "",
    offsetSeconds: 0,
  });
});
