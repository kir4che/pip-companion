import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/subtitle-language-tags.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function getLanguageTags() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.subtitleLanguageTags;
}

test("matches language tags across case, separators and subtags", () => {
  const tags = getLanguageTags();
  assert.equal(tags.normalize("ZH_hant"), "zh-hant");
  assert.equal(tags.matches("zh-Hant-TW", "zh-hant"), true);
  assert.equal(tags.matches("en", "en-US"), true);
  assert.equal(tags.matches("en", "fr"), false);
});

test("matches subtitle language aliases with Chinese script awareness", () => {
  const tags = getLanguageTags();
  assert.equal(tags.matchesSubtitleLanguages("zh_TW", "zh-Hant"), true);
  assert.equal(tags.matchesSubtitleLanguages("zh-CN", "zh-Hant"), false);
  assert.equal(tags.matchesSubtitleLanguages("en-US", "en-GB"), true);
  assert.equal(tags.matchesSubtitleLanguages("", "en"), false);
});

test("validates translation language tags", () => {
  const tags = getLanguageTags();
  assert.equal(tags.isValid("zh-Hant"), true);
  assert.equal(tags.isValid("en-US"), true);
  assert.equal(tags.isValid(""), false);
  assert.equal(tags.isValid("x".repeat(36)), false);
  assert.equal(tags.isValid("en--US"), false);
});
