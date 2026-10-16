import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/pip/progress-math.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function getMath() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.pipProgressMath;
}

test("maps pointer coordinates to a clamped progress ratio", () => {
  const math = getMath();
  assert.equal(math.ratioAt(125, 100, 100), 0.25);
  assert.equal(math.ratioAt(50, 100, 100), 0);
  assert.equal(math.ratioAt(250, 100, 100), 1);
  assert.equal(math.ratioAt(100, 100, 0), null);
  assert.equal(math.ratioAt(100, 100, -1), null);
});

test("maps progress ratios to playback time and range value", () => {
  const math = getMath();
  assert.equal(math.timeAt(0.25, 120), 30);
  assert.equal(math.valueAt(0.255, 100), 26);
});
