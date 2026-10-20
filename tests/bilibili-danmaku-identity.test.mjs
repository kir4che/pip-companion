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
  { messagesFor = () => [] } = {},
) {
  const sentMessages = [];
  const clearedRenderers = [];
  const emittedMessages = [];
  const listeners = new Map();

  class MockElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      const classSet = new Set();
      this.classList = {
        add(...classes) {
          for (const c of classes) classSet.add(c);
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
    addEventListener(e, fn, options) {
      if (!listeners.has(e)) listeners.set(e, new Set());
      const record = { fn, signal: options?.signal };
      listeners.get(e).add(record);
      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          listeners.get(e)?.delete(record);
        });
      }
    },
    dispatchEvent(e) {
      for (const record of listeners.get(e) || []) {
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
    emit(data) {
      emittedMessages.push(data);
    },
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
            messages: messagesFor(msg),
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
    context,
    mockLocation,
    mockDocument,
    mockVideo,
    sentMessages,
    clearedRenderers,
    emittedMessages,
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

test("Bilibili danmaku resyncs the playback cursor when the same video reloads for the next episode", async () => {
  const flush = async () => {
    for (let i = 0; i < 3; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/video/BV1xx411c7mD/?p=1",
    {
      messagesFor: (msg) =>
        msg.page === 1
          ? [{ id: "1", replayTime: 1, type: "right", text: "ep1" }]
          : [{ id: "2", replayTime: 1, type: "right", text: "ep2" }],
    },
  );

  env.controller.checkAndBind(env.mockVideo);
  await flush();
  env.mockVideo.currentTime = 1.1;
  env.mockVideo.dispatchEvent("timeupdate");
  assert.deepEqual(
    env.emittedMessages.map((msg) => msg.text),
    ["ep1"],
  );

  // 自動換集：URL 先更新，媒體仍停在舊影片的時間點。
  env.mockLocation.search = "?p=2";
  env.mockVideo.currentTime = 60;
  env.controller.checkAndBind(env.mockVideo);
  await flush();
  assert.equal(env.sentMessages.at(-1).page, 2);

  // 媒體在同一元素重新載入後，游標應對齊新影片的播放位置。
  env.mockVideo.currentTime = 0;
  env.emittedMessages.length = 0;
  env.mockVideo.dispatchEvent("loadedmetadata");
  env.mockVideo.currentTime = 1.1;
  env.mockVideo.dispatchEvent("timeupdate");

  assert.deepEqual(
    env.emittedMessages.map((msg) => msg.text),
    ["ep2"],
  );
});

test("Bilibili danmaku detects Bangumi episode from DOM in season page (/bangumi/play/ss...)", () => {
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/bangumi/play/ss33802",
  );

  const epItem = env.mockDocument.createElement("div");
  epItem.classList.add("bpx-player-ctrl-eplist-item", "active");
  epItem.dataset.epId = "814835";
  env.mockDocument.body.children.push(epItem);

  env.controller.checkAndBind(env.mockVideo);

  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].epId, "814835");
});

test("Bilibili danmaku detects active item bvid in playlist without URL bvid param", () => {
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/list/watchlater",
  );

  const podItem = env.mockDocument.createElement("div");
  podItem.classList.add("video-pod__item", "active");
  podItem.dataset.key = "BV1xx411c7mD";
  env.mockDocument.body.children.push(podItem);

  env.controller.checkAndBind(env.mockVideo);

  assert.equal(env.sentMessages.length, 1);
  assert.equal(env.sentMessages[0].bvid, "BV1xx411c7mD");
  assert.equal(env.sentMessages[0].page, 1);
});

test("Bilibili danmaku deduplicates messages without id across segment requests", async () => {
  const flush = async () => {
    for (let i = 0; i < 3; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/video/BV1xx411c7mD/",
    {
      messagesFor: () => [
        { replayTime: 1.5, type: "right", color: "#ffffff", text: "彈幕1" },
        { replayTime: 2.0, type: "right", color: "#ffffff", text: "彈幕2" },
      ],
    },
  );

  env.controller.checkAndBind(env.mockVideo);
  await flush();
  assert.equal(env.controller.getMessages().length, 2);

  // 模擬再次載入相同訊息（例如分段重新請求）
  await env.controller.loadAllMessages();
  await flush();
  assert.equal(env.controller.getMessages().length, 2);
});

test("Bilibili danmaku does not request segments when renderer is null (PiP closed)", () => {
  let activeRenderer = null;
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/video/BV1xx411c7mD/",
  );
  // 覆寫 controller，使其 dependencies.getRenderer 回傳 null
  const nullRendererController =
    env.context.PipCompanion.ContentBilibiliDanmaku.create({
      getRenderer: () => activeRenderer,
      isSettingsLoaded: () => true,
      isVisible: () => true,
      getSpeedScale: () => 100,
      lateToleranceSeconds: 0.5,
      restoreWindowSeconds: 5,
      maxScrollRestoreSeconds: 3,
      maxFixedRestoreSeconds: 2,
      maxAdvancedRestoreSeconds: 1200,
    });

  nullRendererController.checkAndBind(env.mockVideo);
  assert.equal(env.sentMessages.length, 0);
});

test("Bilibili danmaku clears previous danmaku on seek and does not restore old messages", async () => {
  const flush = async () => {
    for (let i = 0; i < 3; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const env = createBilibiliDanmakuEnvironment(
    "https://www.bilibili.com/video/BV1xx411c7mD/",
    {
      messagesFor: () => [
        {
          id: "1",
          replayTime: 1.0,
          type: "right",
          color: "#ffffff",
          text: "彈幕1",
        },
        {
          id: "2",
          replayTime: 2.0,
          type: "right",
          color: "#ffffff",
          text: "彈幕2",
        },
        {
          id: "3",
          replayTime: 10.0,
          type: "right",
          color: "#ffffff",
          text: "彈幕3",
        },
      ],
    },
  );

  env.controller.checkAndBind(env.mockVideo);
  await flush();

  // 播放到 1.5 秒，彈幕1 已經發射
  env.mockVideo.currentTime = 1.5;
  env.mockVideo.dispatchEvent("timeupdate");
  assert.equal(env.emittedMessages.length, 1);
  assert.equal(env.emittedMessages[0].text, "彈幕1");

  // 手動跳轉到 8.0 秒（seeking -> seeked）
  const initialClears = env.clearedRenderers.length;
  env.mockVideo.seeking = true;
  env.mockVideo.dispatchEvent("seeking");
  assert.ok(env.clearedRenderers.length > initialClears);

  env.mockVideo.currentTime = 8.0;
  env.mockVideo.seeking = false;
  env.mockVideo.dispatchEvent("seeked");

  // 跳轉後先前 1.0/2.0 的彈幕不應被補發恢復（emittedMessages 仍保持 1）
  assert.equal(env.emittedMessages.length, 1);

  // 播放到 10.5 秒時，正常發射該時間點的彈幕3。
  env.mockVideo.currentTime = 10.5;
  env.mockVideo.dispatchEvent("timeupdate");
  assert.equal(env.emittedMessages.length, 2);
  assert.equal(env.emittedMessages[1].text, "彈幕3");
});
