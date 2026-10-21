import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/danmaku/youtube.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(videoId, initialVideoId, isLiveContent) {
  const observers = [];
  const location = {
    hostname: "www.youtube.com",
    origin: "https://www.youtube.com",
    href: `https://www.youtube.com/watch?v=${videoId}`,
  };
  const document = {
    scripts: [
      {
        textContent: `ytInitialPlayerResponse = ${JSON.stringify({
          videoDetails: { videoId: initialVideoId, isLiveContent },
        })}`,
      },
    ],
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute() {},
      addEventListener() {},
    }),
  };
  const context = {
    location,
    document,
    URL,
    window: { setTimeout, clearTimeout },
    setTimeout,
    clearTimeout,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    AbortController,
    Date,
    setInterval,
    clearInterval,
    PipCompanion: {
      site: {
        isYouTubeHost: () => true,
        parseYouTubeVideoId: (href) => new URL(href).searchParams.get("v"),
      },
      runtimeMessages: { addListener() {} },
      util: { getMessage: (key) => key },
      ContentDanmakuSources: { parseYouTubeMessage: () => null },
    },
  };
  vm.runInNewContext(source, context);
  const controller = context.PipCompanion.ContentYouTubeDanmaku.create({
    relay: false,
    lateToleranceSeconds: 0.5,
    restoreWindowSeconds: 0,
    isSettingsLoaded: () => true,
    isVisible: () => true,
    getSourceVideo: () => null,
    getMainRenderer: () => null,
    getPipRenderer: () => null,
    ensureMainRenderer: () => null,
    clear: () => {},
    broadcast: () => {},
  });
  return { context, location, document, controller, observers };
}

test("YouTube live status ignores initial player data from another SPA video", () => {
  const fixture = setup("video-b", "video-a", true);
  assert.equal(fixture.controller.isLive(), false);

  fixture.location.href = "https://www.youtube.com/watch?v=video-a";
  assert.equal(fixture.controller.isLive(), true);
});

test("YouTube live status cache follows the current video identity", () => {
  const fixture = setup("video-a", "video-a", true);
  assert.equal(fixture.controller.isLive(), true);
  fixture.location.href = "https://www.youtube.com/watch?v=video-b";
  fixture.document.scripts[0].textContent = `ytInitialPlayerResponse = ${JSON.stringify(
    {
      videoDetails: { videoId: "video-b", isLiveContent: false },
    },
  )}`;
  assert.equal(fixture.controller.isLive(), false);
});

test("YouTube live status recognizes past live stream (VOD) when isLiveNow is false", () => {
  const fixture = setup("video-vod", "video-vod", true);
  fixture.document.scripts[0].textContent = `ytInitialPlayerResponse = ${JSON.stringify(
    {
      videoDetails: { videoId: "video-vod", isLiveContent: true },
      microformat: {
        playerMicroformatRenderer: {
          liveBroadcastDetails: { isLiveNow: false },
        },
      },
    },
  )}`;
  assert.equal(fixture.controller.isLive(), false);
});

test("YouTube live status recognizes VOD when endTimestamp exists", () => {
  const fixture = setup("video-ended", "video-ended", true);
  fixture.document.scripts[0].textContent = `ytInitialPlayerResponse = ${JSON.stringify(
    {
      videoDetails: { videoId: "video-ended", isLiveContent: true },
      microformat: {
        playerMicroformatRenderer: {
          liveBroadcastDetails: {
            endTimestamp: "2026-10-21T05:00:00+00:00",
          },
        },
      },
    },
  )}`;
  assert.equal(fixture.controller.isLive(), false);
});

test("YouTube live status respects bridge dataset and player getVideoData", () => {
  const fixture = setup("video-bridged", "video-bridged", true);
  fixture.document.documentElement = {
    dataset: { pipYtVideoId: "video-bridged", pipYtIsLive: "false" },
  };
  assert.equal(fixture.controller.isLive(), false);

  fixture.location.href = "https://www.youtube.com/watch?v=video-live";
  fixture.document.documentElement.dataset = {
    pipYtVideoId: "video-live",
    pipYtIsLive: "true",
  };
  assert.equal(fixture.controller.isLive(), true);
});

test("YouTube VOD waits for native chat when no replay continuation exists", () => {
  const fixture = setup("video-vod-nocont", "video-vod-nocont", true);
  fixture.document.documentElement = {
    dataset: { pipYtVideoId: "video-vod-nocont", pipYtIsLive: "false" },
  };
  const created = [];
  fixture.document.createElement = (tag) => {
    const el = {
      tag,
      style: {},
      setAttribute() {},
      addEventListener() {},
      remove() {},
    };
    created.push(el);
    return el;
  };
  fixture.document.body = {
    appendChild(el) {
      el.isConnected = true;
    },
  };

  fixture.controller.checkAndBind();
  const iframe = created.find((el) => el.tag === "iframe");
  assert.equal(iframe, undefined);
});

test("YouTube VOD extracts continuation from native chat iframe src or engagementPanels", () => {
  const fixture = setup("video-vod-panel", "video-vod-panel", true);
  fixture.document.documentElement = {
    dataset: { pipYtVideoId: "video-vod-panel", pipYtIsLive: "false" },
  };
  const created = [];
  fixture.document.createElement = (tag) => {
    const el = {
      tag,
      style: {},
      setAttribute() {},
      addEventListener() {},
      remove() {},
    };
    created.push(el);
    return el;
  };
  fixture.document.body = {
    appendChild(el) {
      el.isConnected = true;
    },
  };
  fixture.document.scripts.push({
    textContent: `ytInitialData = ${JSON.stringify({
      currentVideoEndpoint: { watchEndpoint: { videoId: "video-vod-panel" } },
      engagementPanels: [
        {
          engagementPanelSectionListRenderer: {
            content: {
              liveChatRenderer: {
                continuations: [
                  {
                    reloadContinuationData: {
                      continuation: "test-panel-token-123",
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    })}`,
  });

  fixture.controller.checkAndBind();
  const iframe = created.find((el) => el.tag === "iframe");
  assert.ok(iframe);
  assert.ok(iframe.src.includes("continuation=test-panel-token-123"));
});

test("YouTube VOD starts native chat offscreen when no replay continuation exists", () => {
  const fixture = setup("video-vod-native-chat", "video-vod-native-chat", true);
  fixture.document.documentElement = {
    dataset: {
      pipYtVideoId: "video-vod-native-chat",
      pipYtIsLive: "false",
    },
  };
  const created = [];
  const originalStyle = "color: red;";
  const hostAttributes = new Set(["collapsed", "hide-chat-frame"]);
  const chatHost = {
    style: { cssText: originalStyle },
    attributes: { style: originalStyle },
    querySelector: (selector) =>
      selector === "#show-hide-button button" ? showChatButton : null,
    isConnected: true,
    hasAttribute(name) {
      return hostAttributes.has(name);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      hostAttributes.add(name);
      if (name === "style") this.style.cssText = value;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      hostAttributes.delete(name);
      if (name === "style") this.style.cssText = "";
    },
  };
  const frameListeners = new Map();
  const nativeChatFrame = {
    src: "",
    dataset: {},
    style: { cssText: "width: 100%;" },
    contentDocument: { querySelector: () => null, documentElement: {} },
    closest: (selector) =>
      selector === "ytd-live-chat-frame" ? chatHost : null,
    getAttribute(name) {
      return name === "style" ? this.style.cssText : null;
    },
    setAttribute(name, value) {
      if (name === "style") this.style.cssText = value;
    },
    removeAttribute(name) {
      this.attributes.style = "";
      if (name === "style") this.style.cssText = "";
    },
    addEventListener(name, callback) {
      frameListeners.set(name, callback);
    },
  };
  let hasChatItems = false;
  nativeChatFrame.contentDocument.querySelector = (selector) =>
    selector === "yt-live-chat-item-list-renderer #items" && hasChatItems
      ? { querySelectorAll: () => [] }
      : null;
  let clickCount = 0;
  let styleAtClick = "";
  const showChatButton = {
    click() {
      clickCount++;
      styleAtClick = chatHost.style.cssText;
      hostAttributes.delete("collapsed");
      hostAttributes.delete("hide-chat-frame");
    },
  };
  fixture.document.querySelector = (selector) =>
    selector.includes("iframe") ? nativeChatFrame : null;
  fixture.document.createElement = (tag) => {
    const element = {
      tag,
      style: {},
      dataset: {},
      setAttribute() {},
      addEventListener() {},
      remove() {},
    };
    created.push(element);
    return element;
  };
  fixture.controller.checkAndBind();

  assert.equal(clickCount, 1);
  assert.match(styleAtClick, /left:\s*-10000px/);
  assert.equal(nativeChatFrame.style.cssText.includes("-10000px"), true);
  assert.equal(
    created.some((element) => element.tag === "iframe"),
    false,
  );

  fixture.controller.checkAndBind();
  assert.equal(clickCount, 1);

  fixture.controller.destroy();
  assert.equal(chatHost.style.cssText, originalStyle);
  assert.equal(nativeChatFrame.style.cssText, "width: 100%;");
  assert.equal(chatHost.hasAttribute("collapsed"), true);
  assert.equal(chatHost.hasAttribute("hide-chat-frame"), true);
});

test("YouTube SPA navigation refreshes a collapsed native chat with stale items", async () => {
  const fixture = setup("video-first", "video-first", false);
  fixture.document.documentElement = {
    dataset: { pipYtVideoId: "video-first", pipYtIsLive: "false" },
  };
  const hostAttributes = new Set(["collapsed", "hide-chat-frame"]);
  let clickCount = 0;
  const chatHost = {
    style: { cssText: "" },
    isConnected: true,
    hasAttribute: (name) => hostAttributes.has(name),
    getAttribute: () => null,
    setAttribute(name) {
      hostAttributes.add(name);
    },
    removeAttribute(name) {
      hostAttributes.delete(name);
    },
    querySelector: (selector) =>
      selector === "#show-hide-button button"
        ? {
            click() {
              clickCount++;
              hostAttributes.delete("collapsed");
              hostAttributes.delete("hide-chat-frame");
            },
          }
        : null,
  };
  const frameListeners = new Map();
  const nativeChatFrame = {
    src: "https://www.youtube.com/live_chat?v=video-first&continuation=old-token",
    dataset: {},
    style: { cssText: "" },
    contentDocument: {
      querySelector: (selector) =>
        selector === "yt-live-chat-item-list-renderer #items"
          ? { querySelectorAll: () => [] }
          : null,
      documentElement: {},
    },
    closest: () => chatHost,
    getAttribute: () => null,
    setAttribute() {},
    removeAttribute() {},
    addEventListener(name, callback) {
      frameListeners.set(name, callback);
    },
  };
  const created = [];
  fixture.document.querySelector = (selector) =>
    selector.includes("iframe") ? nativeChatFrame : null;
  fixture.document.createElement = (tag) => {
    const element = {
      tag,
      style: {},
      dataset: {},
      setAttribute() {},
      addEventListener() {},
      remove() {
        this.isConnected = false;
      },
    };
    created.push(element);
    return element;
  };
  fixture.document.body = {
    appendChild(element) {
      element.isConnected = true;
    },
  };

  fixture.controller.checkAndBind();
  assert.equal(clickCount, 0);
  assert.equal(fixture.controller.isReady(), true);
  fixture.location.href = "https://www.youtube.com/watch?v=video-second";
  fixture.document.documentElement.dataset.pipYtVideoId = "video-second";
  fixture.controller.checkAndBind();

  assert.equal(clickCount, 1);
  assert.equal(fixture.controller.isReady(), false);
  assert.equal(frameListeners.has("load"), true);
  assert.equal(
    created.some((element) => element.tag === "iframe" && element.isConnected),
    false,
  );
  nativeChatFrame.src =
    "https://www.youtube.com/live_chat?v=video-second&continuation=new-token";
  frameListeners.get("load")();
  await new Promise((resolve) => setTimeout(resolve, 450));
  assert.equal(fixture.controller.isReady(), true);
});

test("YouTube VOD briefly buffers and sorts chat before normal replay", async () => {
  const fixture = setup("video-vod-replay", "video-vod-replay", false);
  fixture.document.documentElement = {
    dataset: {
      pipYtVideoId: "video-vod-replay",
      pipYtIsLive: "false",
    },
  };
  const listeners = new Map();
  const video = {
    currentTime: 100,
    paused: false,
    seeking: false,
    ended: false,
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) || [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    fire(name) {
      for (const callback of listeners.get(name) || []) callback();
    },
  };
  const itemsContainer = { querySelectorAll: () => [] };
  const chatDocument = {
    documentElement: {},
    querySelector: (selector) =>
      selector.includes("#items") ? itemsContainer : null,
  };
  const chatFrame = {
    src: "",
    dataset: {},
    contentDocument: chatDocument,
    contentWindow: { document: chatDocument },
    addEventListener() {},
  };
  const broadcasts = [];
  fixture.context.PipCompanion.ContentDanmakuSources.parseYouTubeMessage = (
    node,
  ) => node.data || null;
  fixture.document.querySelector = (selector) => {
    if (selector.includes("iframe")) return chatFrame;
    if (selector === "video.html5-main-video") return video;
    return null;
  };
  fixture.controller =
    fixture.context.PipCompanion.ContentYouTubeDanmaku.create({
      relay: false,
      lateToleranceSeconds: 8,
      restoreWindowSeconds: 5,
      isSettingsLoaded: () => true,
      isVisible: () => true,
      getSourceVideo: () => video,
      getMainRenderer: () => null,
      getPipRenderer: () => null,
      ensureMainRenderer: () => null,
      clear: () => {},
      broadcast: (data, options) => broadcasts.push({ data, options }),
    });
  fixture.controller.checkAndBind();
  const chatObserver = fixture.observers.at(-1);
  const addMessage = (replayTime) => {
    const data = { text: `at ${replayTime}`, replayTime };
    chatObserver.callback([
      {
        addedNodes: [
          {
            nodeType: 1,
            data,
            querySelectorAll: () => [],
          },
        ],
      },
    ]);
  };

  addMessage(98);
  addMessage(89);
  assert.equal(broadcasts.length, 0);
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(broadcasts.length, 2);
  assert.deepEqual(
    broadcasts.map(({ data }) => data.replayTime),
    [89, 98],
  );
  assert.equal(broadcasts[0].options.elapsed, 11);
  assert.equal(broadcasts[1].options.elapsed, 2);
  assert.equal(broadcasts[1].options.restore, true);

  addMessage(101);
  assert.equal(broadcasts.length, 2);
  video.currentTime = 101;
  video.fire("timeupdate");
  assert.equal(broadcasts.length, 3);
  assert.equal(broadcasts[2].options.elapsed, 0);

  video.seeking = true;
  video.fire("seeking");
  video.currentTime = 200;
  video.seeking = false;
  video.fire("seeked");
  assert.equal(broadcasts.length, 3);

  addMessage(198);
  assert.equal(broadcasts.length, 4);
  assert.equal(broadcasts[3].options.elapsed, 2);

  video.seeking = true;
  video.fire("seeking");
  video.currentTime = 100;
  video.seeking = false;
  video.fire("seeked");
  assert.equal(broadcasts.length, 4);
  video.currentTime = 101;
  video.fire("timeupdate");
  assert.equal(broadcasts.length, 5);
  assert.equal(broadcasts[4].data.replayTime, 101);
  assert.equal(broadcasts[4].options.elapsed, 0);
  fixture.controller.destroy();
});
