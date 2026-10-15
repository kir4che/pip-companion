import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const messages = Array.from({ length: 60000 }, (_, index) => ({
  messageId: `message-${index}`,
  replayTime: index / 10,
  text: index === 55000 ? "target" : `message ${index}`,
}));

function setup(kind, options = {}) {
  const requests = [];
  const broadcasts = [];
  const videoListeners = new Map();
  const runtimeListeners = [];
  const video = {
    currentTime: 5500,
    seeking: false,
    currentSrc: "video-1",
    src: "",
    addEventListener(type, listener) {
      const listeners = videoListeners.get(type) ?? [];
      listeners.push(listener);
      videoListeners.set(type, listeners);
    },
  };
  const site = {
    isYouTubeHost: () => false,
    isBilibiliHost: (host) => host.includes("bilibili.com"),
    isBahamutHost: (host) => host.includes("gamer.com.tw"),
    isTwitchHost: (host) => host.includes("twitch.tv"),
    parseBilibiliVideoPath: (pathname) => {
      if (kind !== "bilibili") return null;
      const bvid = pathname.split("/").filter(Boolean).at(-1) || "BV1234567890";
      return { bvid, avid: "123", videoId: bvid };
    },
  };
  const context = {
    URL,
    AbortController,
    location: {
      href:
        kind === "bahamut"
          ? "https://ani.gamer.com.tw/animeVideo.php?sn=123"
          : kind === "twitch"
            ? "https://www.twitch.tv/first_channel"
            : "https://www.bilibili.com/video/BV1234567890",
      hostname:
        kind === "bahamut"
          ? "ani.gamer.com.tw"
          : kind === "twitch"
            ? "www.twitch.tv"
            : "www.bilibili.com",
      pathname:
        kind === "bahamut"
          ? "/animeVideo.php"
          : kind === "twitch"
            ? "/first_channel"
            : "/video/BV1234567890",
      search: kind === "bahamut" ? "?sn=123" : "",
    },
    DANMAKU_IS_YOUTUBE: false,
    DANMAKU_IS_BILIBILI: kind === "bilibili",
    setTimeout,
    clearTimeout,
    PipCompanion: {
      util: {
        isRecord: (value) =>
          value !== null && typeof value === "object" && !Array.isArray(value),
      },
      site,
      bilibiliDanmakuConfig: { segmentSeconds: 60 },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListeners.push(listener);
          },
        },
        sendMessage(request) {
          requests.push(request);
          if (options.sendMessage) return options.sendMessage(request);
          return Promise.resolve({
            ok: true,
            messages,
            ...(kind === "bilibili" ? { legacyFallback: true } : {}),
          });
        },
      },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../src/content/danmaku/extra-danmaku.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  const controller = context.PipCompanion.ContentExtraBilibiliDanmaku.create({
    isVisible: () => true,
    isSourceAvailable: () => true,
    broadcast: (message) => broadcasts.push(message),
  });
  const url =
    kind === "bahamut"
      ? "https://ani.gamer.com.tw/animeVideo.php?sn=123"
      : kind === "twitch"
        ? "https://www.twitch.tv/first_channel"
        : "https://www.bilibili.com/video/BV1234567890";
  controller.setSource({ enabled: true, url, offsetSeconds: 0 });
  controller.checkAndBind(video);
  return {
    broadcasts,
    requests,
    videoListeners,
    controller,
    dispatchRuntimeMessage(message) {
      for (const listener of runtimeListeners) listener(message, {}, () => {});
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const kind of ["bahamut", "bilibili"]) {
  test(`${kind} retains a complete 60000-message timeline`, async () => {
    const { broadcasts, requests, videoListeners } = setup(kind);
    await flush();
    await flush();
    const danmakuRequests = requests.filter((request) =>
      ["GET_BAHAMUT_DANMAKU", "GET_BILIBILI_DANMAKU"].includes(request.type),
    );
    assert.equal(danmakuRequests.length, 1);
    assert.equal(
      broadcasts.some((message) => message.text === "target"),
      true,
    );

    for (const listener of videoListeners.get("timeupdate") ?? []) listener();
    assert.equal(
      requests.filter((request) =>
        ["GET_BAHAMUT_DANMAKU", "GET_BILIBILI_DANMAKU"].includes(request.type),
      ).length,
      1,
    );
  });
}

test("a delayed response from the previous Bilibili source is ignored", async () => {
  const pending = [];
  const { broadcasts, controller, requests } = setup("bilibili", {
    sendMessage(request) {
      if (request.type === "GET_BILIBILI_DANMAKU")
        return new Promise((resolve) => pending.push(resolve));
      return Promise.resolve({ ok: true });
    },
  });
  const nextUrl = "https://www.bilibili.com/video/BV0987654321";
  controller.setSource({ enabled: true, url: nextUrl, offsetSeconds: 0 });
  assert.equal(pending.length, 2);

  pending[0]({
    ok: true,
    messages: [{ messageId: "old-source", replayTime: 5500, text: "stale" }],
  });
  await flush();
  await flush();

  assert.equal(controller.getSource().url, nextUrl);
  assert.equal(controller.getSource().enabled, true);
  assert.equal(
    broadcasts.some((message) => message.messageId === "old-source"),
    false,
  );

  pending[1]({ ok: true, messages: [] });
  await flush();
  assert.equal(
    requests.filter((request) => request.type === "GET_BILIBILI_DANMAKU")
      .length,
    2,
  );
});

test("Twitch chat ignores messages from an old connection after channel switch", async () => {
  const { broadcasts, controller, dispatchRuntimeMessage } = setup("twitch");
  dispatchRuntimeMessage({
    type: "EXTRA_TWITCH_CHAT_STATUS",
    status: "connected",
    channel: "first_channel",
    connectionId: "connection-1",
  });

  controller.setSource({
    enabled: true,
    url: "https://www.twitch.tv/second_channel",
    offsetSeconds: 0,
  });
  dispatchRuntimeMessage({
    type: "EXTRA_TWITCH_CHAT_STATUS",
    status: "connected",
    channel: "second_channel",
    connectionId: "connection-2",
  });
  const sendChat = (channel, connectionId, text) =>
    dispatchRuntimeMessage({
      type: "EXTRA_TWITCH_CHAT_MESSAGE",
      channel,
      connectionId,
      data: { messageId: text, text },
    });
  sendChat("first_channel", "connection-1", "old channel");
  sendChat("second_channel", "connection-1", "old connection");
  sendChat("second_channel", "connection-2", "current message");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    broadcasts.map((message) => message.text),
    ["current message"],
  );
  assert.equal(
    controller.getSource().url,
    "https://www.twitch.tv/second_channel",
  );
});
