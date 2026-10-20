import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const bilibiliSource = ts.transpileModule(
  readFileSync(
    new URL("../src/content/danmaku/bilibili.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createBilibiliDanmakuEnvironment(
  initialUrl = "https://www.bilibili.com/video/BV1xx411c7mD/",
) {
  const sentMessages = [];
  const clearedRenderers = [];
  const listeners = new Map();

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      const classSet = new Set();
      this.classList = {
        add(c) {
          classSet.add(c);
        },
        delete(c) {
          classSet.delete(c);
        },
        contains(c) {
          return classSet.has(c);
        },
        has(c) {
          return classSet.has(c);
        },
      };
      this.attributes = new Map();
      this.children = [];
      this.dataset = {};
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    setAttribute(name, val) {
      this.attributes.set(name, String(val));
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    }
    querySelectorAll(sel) {
      const results = [];
      for (const child of this.children) {
        if (matchesSelector(child, sel)) results.push(child);
        results.push(...child.querySelectorAll(sel));
      }
      return results;
    }
  }

  function matchesSelector(el, sel) {
    if (sel.includes(".on") && el.classList.has("on")) return true;
    if (sel.includes(".active") && el.classList.has("active")) return true;
    if (
      sel.includes("[aria-current='true']") &&
      el.getAttribute("aria-current") === "true"
    )
      return true;
    if (sel.includes("li") && el.tagName === "LI") return true;
    if (sel.includes(".video-pod__item") && el.classList.has("video-pod__item"))
      return true;
    return false;
  }

  const documentElement = new MockElement("html");
  const body = new MockElement("body");
  documentElement.children.push(body);

  const mockDocument = {
    scripts: [],
    body,
    documentElement,
    createElement(tag) {
      return new MockElement(tag);
    },
    querySelector(sel) {
      return documentElement.querySelector(sel);
    },
    querySelectorAll(sel) {
      return documentElement.querySelectorAll(sel);
    },
  };

  const mockLocation = new URL(initialUrl);

  const mockVideo = {
    currentTime: 0,
    playbackRate: 1,
    paused: false,
    seeking: false,
    currentSrc: "blob:https://www.bilibili.com/source-1",
    src: "",
    addEventListener(event, fn, options) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      const record = { fn, signal: options?.signal };
      listeners.get(event).add(record);
      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          listeners.get(event)?.delete(record);
        });
      }
    },
    dispatchEvent(event) {
      for (const record of listeners.get(event) || []) {
        record.fn();
      }
    },
  };

  const renderer = {
    duration: 5,
    clear() {
      clearedRenderers.push(Date.now());
    },
    updateStyle() {},
    updateVisibility() {},
    setPlaybackRate() {},
    setPaused() {},
    beginSeekRestore() {},
    endSeekRestore() {},
    emit() {},
  };

  const context = {
    location: mockLocation,
    document: mockDocument,
    chrome: {
      runtime: {
        sendMessage(msg) {
          sentMessages.push(msg);
          return Promise.resolve({
            ok: true,
            messages: [],
            duration: 100,
            segmentCount: 1,
            segmentStart: 1,
            segmentEnd: 1,
          });
        },
      },
    },
    PipCompanion: {
      util: {
        isRecord(val) {
          return val !== null && typeof val === "object" && !Array.isArray(val);
        },
      },
      bilibiliDanmakuConfig: {
        segmentSeconds: 360,
      },
      site: {
        isBilibiliHost: () => true,
        parseBilibiliVideoPath(pathname) {
          const match = pathname.match(/^\/video\/(BV[\w]{10}|av\d+)/i);
          if (!match) return null;
          return { videoId: match[1], bvid: match[1], avid: "" };
        },
      },
    },
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    Number,
    Math,
    Set,
    Map,
    WeakSet,
    Array,
    String,
    Boolean,
    URL,
  };

  vm.runInNewContext(bilibiliSource, context);

  const controller = context.PipCompanion.ContentBilibiliDanmaku.create({
    getRenderer: () => renderer,
    isSettingsLoaded: () => true,
    isVisible: () => true,
    getSpeedScale: () => 100,
    lateToleranceSeconds: 0.5,
    restoreWindowSeconds: 5,
    maxScrollRestoreSeconds: 3,
    maxFixedRestoreSeconds: 2,
    maxAdvancedRestoreSeconds: 1200,
  });

  return {
    controller,
    mockLocation,
    mockDocument,
    mockVideo,
    sentMessages,
    clearedRenderers,
  };
}

test("Bilibili danmaku detects multi-page episode switch from DOM when URL does not include ?p", () => {
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/video/BV1xx411c7mD/",
  );

  // 建立分 P 列表（2 個分 P，初始在第 1 P）
  const listContainer = env.mockDocument.createElement("div");
  listContainer.classList.add("cur-list");
  const p1 = env.mockDocument.createElement("li");
  p1.classList.add("on");
  const p2 = env.mockDocument.createElement("li");
  listContainer.children.push(p1, p2);
  env.mockDocument.body.children.push(listContainer);

  env.controller.checkAndBind(env.mockVideo);

  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].bvid, "BV1xx411c7mD");
  assert.equal(env.sentMessages[0].page, 1);

  // 切到第 2 P：DOM 上 p1 失去 .on，p2 獲得 .on，但 URL 依然沒有 ?p=2。
  p1.classList.delete("on");
  p2.classList.add("on");
  env.mockVideo.currentSrc = "blob:https://www.bilibili.com/source-2";

  // 觸發換片
  env.controller.checkAndBind(env.mockVideo);

  // 應該清除了舊彈幕，並發出 page: 2 的彈幕請求！
  assert.equal(env.sentMessages.length, 2);
  assert.equal(env.sentMessages[1].bvid, "BV1xx411c7mD");
  assert.equal(env.sentMessages[1].page, 2);
  assert.ok(env.clearedRenderers.length > 0);
});

test("Bilibili danmaku detects video stream change when loadedmetadata fires", () => {
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/video/BV1xx411c7mD/?p=1",
  );
  env.controller.checkAndBind(env.mockVideo);
  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].page, 1);

  // 切換到新影片
  env.mockLocation.search = "?p=2";
  env.mockVideo.currentSrc = "blob:https://www.bilibili.com/source-next";
  env.mockVideo.dispatchEvent("loadedmetadata");

  assert.equal(env.sentMessages.length, 2);
  assert.equal(env.sentMessages[1].page, 2);
});

test("Bilibili danmaku detects Bangumi episode switch across SPA navigation", () => {
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/bangumi/play/ep814830",
  );
  env.controller.checkAndBind(env.mockVideo);
  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].epId, "814830");

  // 切換到下一話 ep814831
  env.mockLocation.pathname = "/bangumi/play/ep814831";
  env.mockVideo.currentSrc = "blob:https://www.bilibili.com/ep2";
  env.controller.checkAndBind(env.mockVideo);

  assert.equal(env.sentMessages.length, 2);
  assert.equal(env.sentMessages[1].epId, "814831");
  assert.ok(env.clearedRenderers.length > 0);
});
