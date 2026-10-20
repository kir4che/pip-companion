import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const searchSource = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/danmaku-search.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const panelSource = ts.transpileModule(
  readFileSync(
    new URL("../src/content/pip/danmaku-search-panel.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createDanmakuSearch() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(searchSource, context);
  return context.PipCompanion.danmakuSearch;
}

test("searchDanmaku returns matching comments sorted by time with proximity grouping", () => {
  const { searchDanmaku } = createDanmakuSearch();

  const messages = [
    { replayTime: 120, text: "前方高能預警" },
    { replayTime: 121, text: "前方高能預警" },
    { replayTime: 121.5, text: "前方高能預警" },
    { replayTime: 30, text: "OP 很好聽" },
    { replayTime: 250, text: "笑死我了" },
    { replayTime: 500, text: "這段太高能了" },
  ];

  assert.equal(searchDanmaku(messages, "").length, 0);
  assert.equal(searchDanmaku(messages, "   ").length, 0);

  const results = searchDanmaku(messages, "高能");
  assert.equal(results.length, 2);

  assert.equal(results[0].time, 120);
  assert.equal(results[0].text, "前方高能預警");
  assert.equal(results[0].count, 3);

  assert.equal(results[1].time, 500);
  assert.equal(results[1].text, "這段太高能了");
  assert.equal(results[1].count, 1);
});

test("searchDanmaku handles case insensitivity and empty data", () => {
  const { searchDanmaku } = createDanmakuSearch();

  const messages = [
    { replayTime: 10, text: "Best Anime Ever" },
    { replayTime: 20, text: "anime is good" },
  ];

  const results = searchDanmaku(messages, "ANIME");
  assert.equal(results.length, 2);
  assert.equal(results[0].time, 10);
  assert.equal(results[1].time, 20);

  assert.equal(searchDanmaku([], "test").length, 0);
  assert.equal(searchDanmaku(null, "test").length, 0);
});

test("calculateDanmakuHeatPeaks finds top 3 highlights with distance constraints", () => {
  const { calculateDanmakuHeatPeaks } = createDanmakuSearch();

  const messages = [];

  for (let i = 0; i < 10; i++) {
    messages.push({ replayTime: 100 + i * 0.5, text: "神作" });
  }

  for (let i = 0; i < 20; i++) {
    messages.push({ replayTime: 300 + i * 0.5, text: "前方高能" });
  }

  for (let i = 0; i < 8; i++) {
    messages.push({ replayTime: 310 + i * 0.5, text: "臥槽" });
  }

  for (let i = 0; i < 5; i++) {
    messages.push({ replayTime: 600 + i * 0.5, text: "完結撒花" });
  }

  const peaks = calculateDanmakuHeatPeaks(messages, 1000, {
    bucketSeconds: 15,
    topN: 3,
    minDistanceSeconds: 45,
  });

  assert.equal(peaks.length, 3);

  assert.equal(peaks[0].count, 28);
  assert.equal(peaks[0].representativeText, "前方高能");
  assert.ok(Math.abs(peaks[0].time - 307) <= 10);

  assert.equal(peaks[1].count, 10);
  assert.equal(peaks[1].representativeText, "神作");
  assert.ok(Math.abs(peaks[1].time - 107) <= 10);

  assert.equal(peaks[2].count, 5);
  assert.equal(peaks[2].representativeText, "完結撒花");
  assert.ok(Math.abs(peaks[2].time - 607) <= 10);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.hidden = false;
    this.value = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  addEventListener(event, handler) {
    const list = this.listeners.get(event) || [];
    list.push(handler);
    this.listeners.set(event, list);
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const h of list) h(event);
  }

  focus() {}
  select() {}
  blur() {}
}

test("danmakuSearchPanel creates accessible elements and triggers seek on peak click", () => {
  const doc = {
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_ns, tagName) => new FakeElement(tagName),
    createTextNode: (text) => ({ text }),
  };

  const context = {
    PipCompanion: {
      danmakuSearch: createDanmakuSearch(),
      util: { formatTime: (s) => `${s}s` },
    },
  };
  vm.runInNewContext(panelSource, context);

  let soughtSeconds = -1;
  const messages = [
    { replayTime: 50, text: "名場面" },
    { replayTime: 51, text: "名場面" },
    { replayTime: 52, text: "名場面" },
  ];

  const panel = context.PipCompanion.danmakuSearchPanel.create(
    doc,
    (key, subs) => (subs ? `${key}:${subs.join(",")}` : key),
    {
      makeButton(action, label, ariaLabel) {
        const btn = new FakeElement("button");
        btn.dataset.action = action;
        btn.textContent = label;
        btn.setAttribute("aria-label", ariaLabel);
        return btn;
      },
      onSeek: (s) => {
        soughtSeconds = s;
      },
      getMessages: () => messages,
      getDuration: () => 100,
      shortcutHint: "Ctrl+F",
    },
  );

  assert.equal(panel.panel.hidden, true);
  assert.equal(panel.toggle.getAttribute("aria-expanded"), "false");

  panel.open();
  assert.equal(panel.panel.hidden, false);
  assert.equal(panel.toggle.getAttribute("aria-expanded"), "true");
  assert.equal(panel.resultsSection.hidden, true);
  assert.equal(panel.heatSection.hidden, false);

  assert.ok(panel.heatList.children.length > 0);
  const firstChip = panel.heatList.children[0];
  firstChip.dispatchEvent({ type: "click" });

  assert.ok(soughtSeconds >= 45 && soughtSeconds <= 55);
  assert.equal(panel.panel.hidden, true);

  panel.open();
  assert.equal(panel.panel.hidden, false);
  assert.equal(panel.resultsSection.hidden, true);

  panel.input.value = "名場面";
  panel.input.dispatchEvent({ type: "input" });

  assert.equal(panel.resultsSection.hidden, false);
  assert.equal(panel.heatSection.hidden, true);
  assert.ok(panel.resultsList.children.length > 0);

  panel.clearButton.dispatchEvent({ type: "click" });
  assert.equal(panel.input.value, "");
  assert.equal(panel.resultsSection.hidden, true);
  assert.equal(panel.heatSection.hidden, false);

  panel.input.value = "名場面";
  panel.input.dispatchEvent({ type: "input" });
  assert.equal(panel.resultsSection.hidden, false);

  const firstResult = panel.resultsList.children[0];
  firstResult.dispatchEvent({ type: "click" });
  assert.equal(panel.panel.hidden, true);
});
