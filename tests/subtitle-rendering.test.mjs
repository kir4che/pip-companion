import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = [
  "../src/content/subtitles/cue-data.ts",
  "../src/content/subtitles/subtitle-rendering.ts",
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

class FakeElement {
  constructor(tagName, doc) {
    this.tagName = tagName;
    this.ownerDocument = doc;
    this.children = [];
    this.className = "";
    this.hidden = false;
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  get lastElementChild() {
    return this.children.at(-1) ?? null;
  }

  remove() {
    this.parentElement.children.splice(
      this.parentElement.children.indexOf(this),
      1,
    );
  }

  replaceChildren() {
    this.children = [];
  }
}

function setup() {
  const doc = {
    defaultView: { HTMLElement: FakeElement },
    createElement(tagName) {
      return new FakeElement(tagName, doc);
    },
  };
  const context = { PipCompanion: {} };
  vm.runInNewContext(compiled, context);
  context.PipCompanion.subtitleSettings = {
    apply(el, style) {
      el.appliedStyle = style;
    },
    applyLayout(el, layout) {
      el.appliedLayout = layout;
    },
  };
  return {
    api: context.PipCompanion.subtitleRendering,
    subtitle: new FakeElement("div", doc),
  };
}

test("renders grouped subtitle lines as text and reuses their DOM", () => {
  const { api, subtitle } = setup();
  const style = { fontSize: 20 };
  const secondaryStyle = { fontSize: 16 };
  const layout = { pairGap: 10 };
  const lines = [
    {
      pairIndex: 0,
      role: "primary",
      line: { segments: [{ text: "<b>Safe</b>" }] },
    },
    {
      pairIndex: 0,
      role: "secondary",
      line: { segments: [{ text: "line 2" }] },
    },
  ];

  assert.equal(
    api.render(subtitle, lines, style, secondaryStyle, layout),
    true,
  );
  assert.equal(subtitle.hidden, false);
  assert.equal(subtitle.children.length, 1);
  assert.equal(subtitle.children[0].children.length, 2);
  assert.equal(
    subtitle.children[0].children[0].children[0].textContent,
    "<b>Safe</b>",
  );
  assert.equal(subtitle.children[0].children[0].appliedStyle, style);
  assert.equal(subtitle.children[0].children[1].appliedStyle, secondaryStyle);

  api.render(subtitle, [lines[0]], style, secondaryStyle, layout);
  assert.equal(subtitle.children.length, 1);
  assert.equal(subtitle.children[0].children.length, 1);
});

test("clears and hides when there are no display lines", () => {
  const { api, subtitle } = setup();
  subtitle.appendChild(subtitle.ownerDocument.createElement("div"));
  assert.equal(api.render(subtitle, [], {}, {}, {}), false);
  assert.equal(subtitle.hidden, true);
  assert.equal(subtitle.children.length, 0);
});
