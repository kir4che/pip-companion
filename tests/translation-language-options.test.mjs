import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL(
      "../src/content/pip/translation-language-options.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function getOptions() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.translationLanguageOptions;
}

test("builds native subtitle choices and empty states", () => {
  const options = getOptions();
  assert.equal(
    options.nativeTracks(
      [{ id: "fr", label: "French", selected: true }],
      "fr",
      "No tracks",
      "Choose track",
    )[0].value,
    "fr",
  );
  assert.equal(
    options.nativeTracks([], "", "No tracks", "Choose track")[0].disabled,
    true,
  );
  assert.equal(
    options.nativeTracks(
      [{ id: "fr", label: "French", selected: false }],
      "",
      "No tracks",
      "Choose track",
    )[0].label,
    "Choose track",
  );
});

test("localizes translation languages and retains an unknown selection", () => {
  const result = getOptions().translationLanguages(
    [
      { code: "en", label: "English" },
      { code: "fr", label: "fr" },
    ],
    "xx",
    (code) => ({ fr: "French", xx: "Unknown language" })[code] ?? code,
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(result.map(({ value, label }) => ({ value, label }))),
    ),
    [
      { value: "en", label: "English" },
      { value: "fr", label: "French" },
      { value: "xx", label: "Unknown language" },
    ],
  );
});
