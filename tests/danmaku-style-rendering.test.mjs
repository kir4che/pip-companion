import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/danmaku-style-rendering.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function getRendering() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.danmakuStyleRendering;
}

function control(key) {
  return {
    key,
    input: {
      value: "",
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    },
    output: { value: "" },
  };
}

test("renders danmaku values and speed labels", () => {
  const controls = [
    control("fontSizeScale"),
    control("maxFontSize"),
    control("speedScale"),
  ];
  const fontFamily = { value: "" };
  getRendering().render(
    {
      fontFamily: "sans-serif",
      fontSizeScale: 120,
      maxFontSize: 48,
      opacity: 75,
      speedScale: 1.5,
      fontWeight: 600,
      displayArea: 80,
    },
    controls,
    fontFamily,
    [
      { value: 1, label: "Slow" },
      { value: 1.5, label: "Normal" },
    ],
  );
  assert.equal(controls[0].input.value, "120");
  assert.equal(controls[0].output.value, "120%");
  assert.equal(controls[1].output.value, "48px");
  assert.equal(controls[2].input.value, "1");
  assert.equal(controls[2].output.value, "Normal");
  assert.equal(controls[2].input.attributes["aria-valuetext"], "Normal");
  assert.equal(fontFamily.value, "sans-serif");
});
