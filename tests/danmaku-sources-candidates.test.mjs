import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/danmaku/sources.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = text;
  }
}

class FakeElement {
  constructor({ className = "", tag = "span", text = "", parent = null } = {}) {
    this.nodeType = 1;
    this.tagName = tag;
    this.className = className;
    this.id = "";
    this.parentElement = parent;
    this.isConnected = true;
    this.childNodes = text ? [new FakeText(text)] : [];
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join("");
  }

  matches(selector) {
    return String(selector)
      .split(",")
      .some((raw) => {
        const part = raw.trim();
        const cls = /^\[class\*="([^"]+)"\s*i?\]$/.exec(part);
        if (cls) return this.className.includes(cls[1]);
        const idMatch = /^\[id\*="([^"]+)"\s*i?\]$/.exec(part);
        if (idMatch) return this.id.includes(idMatch[1]);
        return this.className
          .split(/\s+/)
          .some((token) => token && part.includes(token));
      });
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }

  closest(selector) {
    for (let el = this; el; el = el.parentElement) {
      if (el.matches(selector)) return el;
    }
    return null;
  }

  getAttribute() {
    return null;
  }
}

function createBahamutSources() {
  let observerCallback = null;
  const broadcasts = [];
  const video = new FakeElement({ tag: "video" });
  const wrapper = new FakeElement({ tag: "div" });
  const root = new FakeElement({ className: "video-js", tag: "div" });
  wrapper.parentElement = root;
  video.parentElement = wrapper;

  const context = {
    PipCompanion: {
      site: {
        isYouTubeHost: () => false,
        isTwitchHost: () => false,
        isBahamutHost: () => true,
        isBilibiliHost: () => false,
        isBilibiliLiveHost: () => false,
      },
    },
    location: {
      hostname: "ani.gamer.com.tw",
      pathname: "/animeVideo.php",
      search: "?sn=9399",
      href: "https://ani.gamer.com.tw/animeVideo.php?sn=9399",
    },
    document: {
      querySelector: (selector) => (selector === "video" ? video : null),
      querySelectorAll: () => [],
      body: new FakeElement({ tag: "body" }),
    },
    window: {
      getComputedStyle: () => ({ backgroundColor: "rgba(0, 0, 0, 0)" }),
    },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    Element: FakeElement,
    URL,
    MutationObserver: class {
      constructor(callback) {
        observerCallback = callback;
      }

      observe() {}

      disconnect() {}
    },
  };
  vm.runInNewContext(source, context);

  const controller = context.PipCompanion.ContentDanmakuSources.create({
    broadcast: (data) => broadcasts.push(data),
    clear: () => {},
    isSettingsLoaded: () => true,
    isVisible: () => true,
  });
  return {
    controller,
    broadcasts,
    mutate(addedNodes) {
      assert.ok(observerCallback, "checkAndBind 應建立 observer");
      observerCallback([{ type: "childList", addedNodes }]);
    },
  };
}

test("bahamut sources 把站內彈幕廣播出去，但排除擴充自己的節點", () => {
  const { controller, broadcasts, mutate } = createBahamutSources();
  controller.checkAndBind();
  assert.equal(broadcasts.length, 0, "綁定時的 seed 不廣播");

  mutate([new FakeElement({ className: "danmu", text: "簽到啦" })]);
  assert.deepEqual(
    broadcasts.map((data) => data.text),
    ["簽到啦"],
  );

  const overlay = new FakeElement({
    className: "yt-danmaku-overlay",
    tag: "div",
  });
  mutate([
    new FakeElement({
      className: "yt-danmaku-item is-jump",
      text: "空降00:03",
      parent: overlay,
    }),
  ]);
  assert.deepEqual(
    broadcasts.map((data) => data.text),
    ["簽到啦"],
    "擴充自己的節點不得重播",
  );
});

test("twitch sources 收集彈幕並解析 VOD 時間戳", () => {
  let observerCallback = null;
  const broadcasts = [];
  const root = new FakeElement({
    className: "video-chat__message-list-wrapper",
    tag: "div",
  });
  const ul = new FakeElement({ tag: "ul", parent: root });

  const context = {
    PipCompanion: {
      site: {
        isYouTubeHost: () => false,
        isTwitchHost: () => true,
        isBahamutHost: () => false,
        isBilibiliHost: () => false,
        isBilibiliLiveHost: () => false,
      },
      util: {
        parseTime: (value) => {
          const parts = value.split(":").map(Number);
          return parts.reduce((acc, part) => acc * 60 + part, 0);
        },
      },
    },
    location: {
      hostname: "www.twitch.tv",
      pathname: "/videos/123456789",
      search: "",
      href: "https://www.twitch.tv/videos/123456789",
      origin: "https://www.twitch.tv",
    },
    document: {
      querySelector: (selector) => {
        if (selector.includes("video-chat__message-list-wrapper")) return root;
        return null;
      },
      querySelectorAll: () => [],
      body: new FakeElement({ tag: "body" }),
    },
    window: {
      getComputedStyle: () => ({ backgroundColor: "rgba(0, 0, 0, 0)" }),
    },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    Element: FakeElement,
    URL,
    MutationObserver: class {
      constructor(callback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    },
  };
  vm.runInNewContext(source, context);

  const controller = context.PipCompanion.ContentDanmakuSources.create({
    broadcast: (data) => broadcasts.push(data),
    clear: () => {},
    isSettingsLoaded: () => true,
    isVisible: () => true,
  });

  controller.checkAndBind();

  const msgNode = new FakeElement({
    className: "vod-message",
    parent: ul,
  });
  msgNode.querySelector = (selector) => {
    if (selector.includes("time")) {
      return new FakeElement({ text: "01:23" });
    }
    if (selector.includes("body") || selector.includes("text")) {
      return new FakeElement({ text: "Twitch 彈幕測試" });
    }
    return null;
  };

  observerCallback([{ type: "childList", addedNodes: [msgNode] }]);

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].text, "Twitch 彈幕測試");
  assert.equal(broadcasts[0].replayTime, 83);
  assert.equal(controller.getMessages().length, 1);
  assert.equal(controller.getMessages()[0].replayTime, 83);
});
