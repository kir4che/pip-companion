import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/pip/playback-controls.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

test("builds playback controls with expected defaults and accessibility labels", () => {
  const doc = {
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  };
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  const elements = context.PipCompanion.playbackControls.create(
    doc,
    (key, value) => (value ? `${key}:${value}` : key),
    (action, label, ariaLabel) => {
      const button = new FakeElement("button");
      button.dataset = { action };
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      return button;
    },
    "volume-icon-path",
  );

  assert.equal(elements.speedButton.textContent, "1×");
  assert.equal(elements.speedButton.className, "speed-button");
  assert.equal(elements.timeCurrent.value, "0:00");
  assert.equal(elements.timeCurrent.maxLength, 12);
  assert.equal(elements.timeDuration.textContent, "/ 0:00");
  assert.equal(elements.progress.type, "range");
  assert.equal(elements.progress.max, "1000");
  assert.equal(elements.progressMax, 1000);
  assert.equal(elements.volumeValue.value, "100");
  assert.equal(elements.volumeSlider.max, "300");
  assert.equal(elements.speedSlider.value, "1");
  assert.equal(elements.volumePath.attributes.get("d"), "volume-icon-path");
  assert.equal(
    elements.volumeButton.attributes.get("aria-label"),
    "pipVolumeControl",
  );
  assert.equal(elements.speedSlider.attributes.get("aria-label"), "pipSpeed");
});
