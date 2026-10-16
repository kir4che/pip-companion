import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/pip/danmaku-input-panel.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

function setup(canSend) {
  const doc = {
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  };
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.danmakuInputPanel.create(doc, (key) => key, {
    canSend,
    makeButton(action, label, ariaLabel) {
      const button = new FakeElement("button");
      button.dataset.action = action;
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      return button;
    },
  });
}

test("builds an accessible danmaku input panel and respects sender availability", () => {
  const panel = setup(true);
  assert.equal(panel.toggle.hidden, false);
  assert.equal(panel.toggle.attributes.get("aria-expanded"), "false");
  assert.equal(panel.toggle.attributes.get("aria-controls"), panel.panel.id);
  assert.equal(panel.panel.hidden, true);
  assert.equal(panel.input.attributes.get("aria-describedby"), panel.count.id);
  assert.equal(panel.input.attributes.get("aria-label"), "pipChatMessage");
  assert.equal(panel.submit.type, "submit");
  assert.equal(panel.status.attributes.get("role"), "status");
  assert.equal(panel.status.hidden, true);

  assert.equal(setup(false).toggle.hidden, true);
});
