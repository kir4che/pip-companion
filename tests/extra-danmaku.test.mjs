import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const messages = Array.from({ length: 60000 }, (_, i) => ({
  messageId: `message-${i}`,
  replayTime: i / 10,
  text: i === 55000 ? "target" : `message ${i}`,
}));

function setup(kind, options = {}) {
  const requests = [];
  const broadcasts = [];
  const videoListeners = new Map();
  const runtimeListeners = [];
  const intervals = [];
  const timeouts = [];
  let nextId = 0;
  let clears = 0;
  const video = {
    currentTime: 5500,
    seeking: false,
    paused: false,
    ended: false,
    currentSrc: "video-1",
    src: "",
    addEventListener(type, listener) {
      const listeners = videoListeners.get(type) ?? [];
      listeners.push(listener);
      videoListeners.set(type, listeners);
    },
  };
  const site = {
    isYouTubeHost: (host) => /(^|\.)youtube\.com$/.test(host),
    parseYouTubeVideoId: (url) => new URL(url).searchParams.get("v"),
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
    setTimeout: options.captureTimeouts
      ? (fn, delay) => {
          const timeout = { fn, delay, cleared: false };
          timeouts.push(timeout);
          return timeout;
        }
      : setTimeout,
    clearTimeout: options.captureTimeouts
      ? (timeout) => {
          if (timeout) timeout.cleared = true;
        }
      : clearTimeout,
    setInterval: (fn) => {
      intervals.push(fn);
      return intervals.length;
    },
    clearInterval: () => {},
    crypto: { randomUUID: () => `connection-${++nextId}` },
    PipCompanion: {
      runtimeMessages: {
        addListener(types, listener) {
          const messageTypes = typeof types === "string" ? [types] : types;
          runtimeListeners.push((msg, sender, sendResponse) => {
            if (messageTypes.includes(msg.type))
              return listener(msg, sender, sendResponse);
          });
        },
      },
      util: {
        isRecord: (value) =>
          value !== null && typeof value === "object" && !Array.isArray(value),
      },
      site,
      bilibiliDanmakuConfig: { segmentSeconds: 60 },
    },
    chrome: {
      runtime: {
        id: "test-extension",
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
    broadcast: (msg) => broadcasts.push(msg),
    clear: () => clears++,
  });
  const url =
    kind === "youtube"
      ? "https://www.youtube.com/watch?v=aT2ZZCEEwzg"
      : kind === "bahamut"
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
    video,
    intervals,
    timeouts,
    getClears: () => clears,
    dispatchRuntimeMessage(msg) {
      for (const listener of runtimeListeners)
        listener(msg, { id: "test-extension" }, () => {});
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
      broadcasts.some((msg) => msg.text === "target"),
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
    broadcasts.some((msg) => msg.messageId === "old-source"),
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
    broadcasts.map((msg) => msg.text),
    ["current message"],
  );
  assert.equal(
    controller.getSource().url,
    "https://www.twitch.tv/second_channel",
  );
});

function replaySetup() {
  const s = setup("youtube", {
    sendMessage: () => Promise.resolve({ ok: true, mode: "replay" }),
  });
  const chat = (time, extra = {}) =>
    s.dispatchRuntimeMessage({
      type: "EXTRA_YOUTUBE_CHAT_MESSAGE",
      videoId: "aT2ZZCEEwzg",
      connectionId: "connection-1",
      seekRevision: 0,
      data: { text: "replay", messageId: `message-${time}`, replayTime: time },
      ...extra,
    });
  const event = (name) => {
    for (const listener of s.videoListeners.get(name) || []) listener();
  };
  return { ...s, chat, event };
}

test("YouTube replay buffers future messages without emitting a paused historical batch", async () => {
  const s = replaySetup();
  await flush();
  s.video.paused = true;
  s.chat(5499);
  s.chat(5500);
  s.chat(5501);
  s.event("timeupdate");
  assert.equal(s.broadcasts.length, 0);
  s.video.currentTime = 5501;
  s.video.paused = false;
  s.event("timeupdate");
  s.event("timeupdate");
  assert.deepEqual(
    s.broadcasts.map((m) => m.replayTime),
    [5501],
  );
  s.video.paused = true;
  s.chat(5501.1);
  assert.equal(s.broadcasts.length, 1);
});

test("YouTube replay ignores old sessions and seek revisions but can replay a backward seek", async () => {
  const s = replaySetup();
  await flush();
  s.chat(5500, { connectionId: "obsolete" });
  assert.equal(s.broadcasts.length, 0);
  s.chat(5500);
  assert.equal(s.broadcasts.length, 1);
  s.video.seeking = true;
  s.event("seeking");
  s.video.currentTime = 5499;
  s.video.seeking = false;
  s.event("seeked");
  s.chat(5500);
  s.video.currentTime = 5500;
  s.event("timeupdate");
  assert.equal(s.broadcasts.length, 1);
  s.chat(5500, { seekRevision: 1 });
  assert.equal(s.broadcasts.length, 2);
  assert.equal(s.getClears(), 1);
  const clock = s.requests
    .filter((m) => m.type === "EXTRA_YOUTUBE_CHAT_CLOCK")
    .at(-1);
  assert.equal(clock.seekRevision, 1);
});

test("YouTube disconnect disables the source and prevents late messages from rendering", async () => {
  const s = replaySetup();
  await flush();
  s.dispatchRuntimeMessage({
    type: "EXTRA_YOUTUBE_CHAT_STATUS",
    videoId: "aT2ZZCEEwzg",
    connectionId: "connection-1",
    status: "error",
    error: "source closed",
  });
  s.chat(5500);
  assert.equal(s.broadcasts.length, 0);
  assert.equal(s.controller.getSource().enabled, false);
  assert.match(s.controller.getSource().error, /source closed/);
  assert.equal(s.getClears(), 1);
});

test("YouTube source reports loading until the relay connects", async () => {
  let resolveStart;
  const s = setup("youtube", {
    sendMessage(request) {
      if (request.type === "START_EXTRA_YOUTUBE_CHAT")
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      return Promise.resolve({ ok: true });
    },
  });
  await flush();
  const statuses = () =>
    s.requests.filter((msg) => msg.type === "EXTRA_DANMAKU_SOURCE_STATUS");
  assert.equal(statuses().at(-1).loading, true);
  assert.equal(s.controller.getSource().loading, true);

  resolveStart({ ok: true, mode: "replay" });
  await flush();
  assert.equal(statuses().at(-1).loading, false);
  assert.equal(s.controller.getSource().loading, false);
});

test("a stalled YouTube source start times out and disables the source", async () => {
  const s = setup("youtube", {
    captureTimeouts: true,
    sendMessage(request) {
      if (request.type === "START_EXTRA_YOUTUBE_CHAT")
        return new Promise(() => {});
      return Promise.resolve({ ok: true });
    },
  });
  await flush();
  const startTimer = s.timeouts.find((timeout) => timeout.delay === 45000);
  assert.ok(startTimer, "expected a start timeout to be scheduled");
  assert.equal(s.controller.getSource().loading, true);

  startTimer.fn();
  await flush();
  assert.equal(s.controller.getSource().enabled, false);
  assert.equal(s.controller.getSource().loading, false);
  assert.match(s.controller.getSource().error, /逾時/);
});
