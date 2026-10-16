import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/options/subtitle-style-rendering.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function element() {
  return {
    value: "",
    disabled: false,
    hidden: false,
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function getRendering() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.subtitleStyleRendering;
}

test("renders subtitle controls, layout and previews", () => {
  const controls = [
    { key: "fontWeight", input: element(), output: element() },
    { key: "edgeIntensity", input: element(), output: element() },
  ];
  const styles = {
    primary: {
      fontFamily: "sans-serif",
      fontWeight: 600,
      lineHeightScale: 100,
      fontSizeScale: 110,
      textColor: "#fff",
      backgroundColor: "#000",
      backgroundOpacity: 70,
      edgeStyle: "outline",
      edgeColor: "#000",
      edgeIntensity: 3,
      bottomOffset: 10,
    },
    secondary: {
      fontFamily: "serif",
      fontWeight: 400,
      lineHeightScale: 100,
      fontSizeScale: 100,
      textColor: "#eee",
      backgroundColor: "#000",
      backgroundOpacity: 70,
      edgeStyle: "shadow",
      edgeColor: "#000",
      edgeIntensity: 2,
      bottomOffset: 10,
    },
  };
  const elements = Array.from({ length: 15 }, element);
  const applied = [];
  const subtitleSettings = {
    apply: (...args) => applied.push(["apply", ...args]),
    applyLayout: (...args) => applied.push(["layout", ...args]),
  };
  getRendering().render({
    activeTarget: "primary",
    styles,
    styleControls: controls,
    fontFamily: elements[0],
    textColor: elements[1],
    edgeStyle: elements[2],
    edgeColor: elements[3],
    edgeIntensityRow: elements[4],
    styleButtons: { primary: elements[5], secondary: elements[6] },
    styleLoaded: true,
    subtitlePreview: elements[7],
    subtitlePreviewPrimary: elements[8],
    subtitlePreviewSecondary: elements[9],
    layout: {
      pairGap: 35,
      letterSpacing: 12,
      backgroundColor: "#111",
      backgroundOpacity: 80,
      bottomOffset: 20,
    },
    pairGap: elements[10],
    pairGapValue: elements[11],
    letterSpacing: elements[12],
    letterSpacingValue: elements[13],
    backgroundColor: elements[14],
    backgroundOpacity: element(),
    backgroundOpacityValue: element(),
    position: element(),
    positionValue: element(),
    subtitleSettings,
  });
  assert.equal(controls[0].output.value, "600");
  assert.equal(controls[1].output.value, "3");
  assert.equal(elements[3].disabled, false);
  assert.equal(elements[4].hidden, false);
  assert.equal(elements[10].value, "35");
  assert.equal(elements[11].value, "0.35em");
  assert.equal(elements[14].value, "#111");
  assert.equal(elements[5].attributes["aria-pressed"], "true");
  assert.equal(elements[6].attributes["aria-pressed"], "false");
  assert.equal(applied.length, 4);
});
