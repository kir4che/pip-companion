import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/pip/playlist-rendering.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = "";
    this.classes = new Set();
    this.classList = { add: (name) => this.classes.add(name) };
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(name, callback) {
    this.listeners[name] = callback;
  }
}

function setup() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  const doc = { createElement: (tagName) => new Element(tagName) };
  const panel = new Element("section");
  return { renderer: context.PipCompanion.playlistRendering, doc, panel };
}

test("renders playlist entries and identifies the known current item", () => {
  const { renderer, doc, panel } = setup();
  const selected = [];
  const current = renderer.render(
    doc,
    panel,
    [
      { index: 2, title: "Episode 3", duration: "12:34" },
      { index: 3, title: "Episode 4" },
    ],
    3,
    true,
    (index) => selected.push(index),
  );
  assert.equal(panel.children.length, 2);
  assert.equal(
    panel.children[0].attributes["aria-label"],
    "3. Episode 3, 12:34",
  );
  assert.equal(panel.children[0].children[0].textContent, "03");
  assert.equal(panel.children[0].children[2].textContent, "12:34");
  assert.equal(panel.children[1].classes.has("current"), true);
  assert.equal(current, panel.children[1]);
  panel.children[0].listeners.click();
  assert.deepEqual(selected, [2]);
});

test("clears previous playlist entries and skips current when unknown", () => {
  const { renderer, doc, panel } = setup();
  panel.append(new Element("button"));
  const current = renderer.render(
    doc,
    panel,
    [{ index: 0, title: "Only row" }],
    0,
    false,
    () => {},
  );
  assert.equal(panel.children.length, 1);
  assert.equal(current, null);
  assert.equal(panel.children[0].classes.has("current"), false);
});
