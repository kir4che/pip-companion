import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/content/feedback.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createFeedbackContext(initialState = {}) {
  const elements = [];
  const fakeDoc = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        style: {},
        attributes: {},
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        dataset: {},
        hidden: true,
        textContent: "",
        ownerDocument: fakeDoc,
        replaceChildren() {},
        appendChild(child) {
          elements.push(child);
        },
      };
      return el;
    },
    body: {
      appendChild(child) {
        elements.push(child);
      },
    },
    documentElement: {},
  };

  const state = {
    pipUi: null,
    feedbackTimer: 0,
    pageToastEl: null,
    pageToastTimer: 0,
    sourceVideo: null,
    ...initialState,
  };

  const timers = [];
  const fakeWindow = {
    setTimeout(fn, delay) {
      const id = timers.length + 1;
      timers.push({ id, fn, delay });
      return id;
    },
    clearTimeout() {},
  };

  const context = {
    globalThis: {
      PipCompanion: {},
    },
    state,
    document: fakeDoc,
    window: fakeWindow,
  };

  vm.runInNewContext(source, context);

  return {
    feedback: context.globalThis.PipCompanion.ContentFeedback,
    state,
    elements,
  };
}

test("showFeedback does not show toast on native video when PiP is closed", () => {
  const { feedback, state, elements } = createFeedbackContext({ pipUi: null });

  feedback.showFeedback("pipDanmakuOff");

  assert.equal(state.pageToastEl, null);
  assert.equal(elements.length, 0);
});

test("showFeedback displays inside PiP window when pipUi is active", () => {
  const pipFeedbackEl = {
    dataset: {},
    hidden: true,
    textContent: "",
    ownerDocument: {},
  };
  const { feedback, state, elements } = createFeedbackContext({
    pipUi: { feedback: pipFeedbackEl },
  });

  feedback.showFeedback("pipDanmakuOn");

  assert.equal(pipFeedbackEl.dataset.mode, "text");
  assert.equal(pipFeedbackEl.textContent, "pipDanmakuOn");
  assert.equal(pipFeedbackEl.hidden, false);
  assert.equal(state.pageToastEl, null);
  assert.equal(elements.length, 0);
});

test("showPageToast displays on native page for PiP launch/switch issues", () => {
  const { feedback, state, elements } = createFeedbackContext({ pipUi: null });

  feedback.showPageToast("無法開啟畫中畫");

  assert.ok(state.pageToastEl);
  assert.equal(state.pageToastEl.textContent, "無法開啟畫中畫");
  assert.equal(elements.includes(state.pageToastEl), true);
});
