import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/subtitle-line-fit.ts", import.meta.url),
    "utf8",
  ) +
    readFileSync(
      new URL("../src/content/subtitles/subtitle-fitting.ts", import.meta.url),
      "utf8",
    ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class FakeElement {
  constructor(width, children = []) {
    this.width = width;
    this.children = children;
    this.classes = new Set();
    this.properties = new Map();
    this.style = {
      width: "",
      maxWidth: "",
      whiteSpace: "",
      removeProperty: (name) => {
        this.properties.delete(name);
        if (name === "width") this.style.width = "";
        if (name === "max-width") this.style.maxWidth = "";
        if (name === "white-space") this.style.whiteSpace = "";
      },
      setProperty: (name, value) => this.properties.set(name, value),
    };
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classes.has(name);
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
        return enabled;
      },
    };
  }

  querySelector(selector) {
    return selector === ".subtitle-segment" ? (this.segment ?? null) : null;
  }

  getBoundingClientRect() {
    return { width: this.width };
  }
}

function createApi() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.subtitleFitting;
}

test("fits paired lines, then wraps lines that remain wider than the container", () => {
  const segment = new FakeElement(0);
  const line = new FakeElement(120);
  line.segment = segment;
  const pair = new FakeElement(0, [line]);
  const view = {
    HTMLElement: FakeElement,
    getComputedStyle: (el) =>
      el === segment
        ? { fontSize: "20px" }
        : { paddingLeft: "4px", paddingRight: "4px" },
  };
  const subtitle = {
    isConnected: true,
    hidden: false,
    clientWidth: 100,
    ownerDocument: { defaultView: view },
    querySelectorAll: () => [pair],
  };
  createApi().fit(subtitle, 0.85);
  assert.equal(line.properties.get("--subtitle-fit-font-size"), "17px");
  assert.equal(pair.classes.has("subtitle-pair--wrapped"), true);
  assert.equal(line.classes.has("subtitle-line--wrapped"), true);
  assert.equal(line.style.width, "");
  assert.equal(line.style.maxWidth, "");
  assert.equal(line.style.whiteSpace, "");
});

test("skips disconnected subtitles", () => {
  const subtitle = {
    isConnected: false,
    hidden: false,
    ownerDocument: { defaultView: {} },
    querySelectorAll() {
      throw new Error("must not inspect disconnected content");
    },
  };
  assert.doesNotThrow(() => createApi().fit(subtitle, 0.85));
});

test("calculates subtitle fitting scale and wrapping threshold", () => {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  const lineFit = context.PipCompanion.subtitleLineFit;
  assert.deepEqual(
    JSON.parse(JSON.stringify(lineFit.calculate(120, 100, 0.85))),
    { scale: 0.85, needsWrapping: true },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(lineFit.calculate(90, 100, 0.85))),
    { scale: 1, needsWrapping: false },
  );
  const fitted = lineFit.calculate(101, 100, 0.85);
  assert.ok(Math.abs(fitted.scale - 100 / 101) < 1e-12);
  assert.equal(fitted.needsWrapping, false);
});
