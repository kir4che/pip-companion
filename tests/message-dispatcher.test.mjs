import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function createDispatcher() {
  let runtimeListener;
  const errors = [];
  const danmakuUtils = { exports: {}, URL };
  const danmakuUtilsSource = readFileSync(
    new URL("../src/background/danmaku-utils.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(danmakuUtilsSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    danmakuUtils,
  );
  const context = {
    URL,
    exports: {},
    require: (path) =>
      path.includes("danmaku-utils")
        ? danmakuUtils.exports
        : {
            isRecord: (value) =>
              value !== null &&
              typeof value === "object" &&
              !Array.isArray(value),
          },
    console: { error: (...args) => errors.push(args) },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListener = listener;
          },
        },
      },
    },
  };
  const source = readFileSync(
    new URL("../src/background/message-dispatcher.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    context,
  );
  return {
    dispatcher: context.exports.runtimeMessageDispatcher,
    errors,
    dispatch: (message, sender = {}) => {
      const responses = [];
      const keepChannelOpen = runtimeListener(message, sender, (response) =>
        responses.push(response),
      );
      return { keepChannelOpen, responses };
    },
  };
}

test("routes only schema-valid messages to handlers registered for their type", () => {
  const { dispatcher, dispatch } = createDispatcher();
  const received = [];
  dispatcher.addListener("GET_BILIBILI_DANMAKU", (message, sender) => {
    received.push({ message, sender });
  });
  dispatcher.addListener("GET_PIP_STATE", () => {
    received.push("pip-state");
  });

  const sender = {
    tab: { id: 12, url: "https://www.bilibili.com/video/BV1234567890" },
    url: "https://www.bilibili.com/player/frame",
  };
  const invalid = dispatch(
    { type: "GET_BILIBILI_DANMAKU", bvid: "bad", page: 1 },
    sender,
  );
  assert.equal(invalid.responses.length, 1);
  assert.equal(invalid.responses[0].ok, false);
  assert.equal(invalid.responses[0].error, "Invalid message");
  assert.equal(received.length, 0);

  const unauthorized = dispatch({
    type: "GET_BILIBILI_DANMAKU",
    bvid: "BV1234567890",
    page: 1,
  });
  assert.equal(unauthorized.responses[0].ok, false);
  assert.equal(unauthorized.responses[0].error, "Unsupported request sender");
  const crossOrigin = dispatch(
    { type: "GET_BILIBILI_DANMAKU", bvid: "BV1234567890", page: 1 },
    {
      tab: { id: 12, url: "https://www.bilibili.com/video/BV1234567890" },
      url: "https://attacker.example/request",
    },
  );
  assert.equal(crossOrigin.responses[0].ok, false);
  assert.equal(crossOrigin.responses[0].error, "Unsupported request sender");
  assert.equal(received.length, 0);

  const request = {
    type: "GET_BILIBILI_DANMAKU",
    bvid: "BV1234567890",
    page: 1,
  };
  dispatch(request, sender);
  assert.equal(received.length, 1);
  assert.equal(received[0].message, request);
  assert.equal(received[0].sender, sender);

  dispatch({ type: "GET_PIP_STATE" });
  assert.equal(received[1], "pip-state");
});

test("keeps async responses open and converts handler rejections to failure responses", async () => {
  const { dispatcher, dispatch, errors } = createDispatcher();
  dispatcher.addListener("GET_PIP_STATE", () =>
    Promise.reject(new Error("failed")),
  );

  const result = dispatch({ type: "GET_PIP_STATE" });
  assert.equal(result.keepChannelOpen, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.responses.length, 1);
  assert.equal(result.responses[0].ok, false);
  assert.equal(errors.length, 1);
});

test("YouTube relay validates clocks and restricts requests to top-frame web senders", () => {
  const { dispatcher, dispatch } = createDispatcher();
  const received = [];
  dispatcher.addListener("EXTRA_YOUTUBE_CHAT_CLOCK", (message) =>
    received.push(message),
  );
  const sender = {
    frameId: 0,
    tab: { id: 1, url: "https://www.twitch.tv/channel" },
    url: "https://www.twitch.tv/channel",
  };
  const clock = {
    type: "EXTRA_YOUTUBE_CHAT_CLOCK",
    connectionId: "session-1",
    time: 4197,
    paused: true,
    ended: false,
    seekRevision: 2,
  };
  for (const value of [
    { ...clock, time: Infinity },
    { ...clock, time: -1 },
    { ...clock, seekRevision: -1 },
    { ...clock, connectionId: "" },
  ])
    assert.equal(dispatch(value, sender).responses[0].error, "Invalid message");
  for (const from of [
    {},
    { ...sender, frameId: 1 },
    { ...sender, url: "https://other.example/" },
  ])
    assert.equal(
      dispatch(clock, from).responses[0].error,
      "Unsupported request sender",
    );
  assert.equal(received.length, 0);
  dispatch(clock, sender);
  assert.equal(received.length, 1);
});

test("YouTube relay accepts same-origin SPA URLs but rejects other origins", () => {
  const { dispatcher, dispatch } = createDispatcher();
  const received = [];
  dispatcher.addListener("EXTRA_YOUTUBE_CHAT_CLOCK", (message) =>
    received.push(message),
  );
  const clock = {
    type: "EXTRA_YOUTUBE_CHAT_CLOCK",
    connectionId: "session-1",
    time: 4197,
    paused: true,
    ended: false,
    seekRevision: 2,
  };
  const sameOrigin = {
    frameId: 0,
    tab: { id: 1, url: "https://www.twitch.tv/second_channel" },
    url: "https://www.twitch.tv/first_channel",
  };
  assert.equal(dispatch(clock, sameOrigin).responses.length, 0);
  assert.equal(received.length, 1);

  for (const other of [
    {
      frameId: 0,
      tab: { id: 1, url: "https://www.twitch.tv/channel" },
      url: "https://evil.example/channel",
    },
    {
      frameId: 0,
      tab: { id: 1, url: "https://www.twitch.tv/channel" },
      url: "https://sub.twitch.tv/channel",
    },
    { ...sameOrigin, frameId: 1 },
  ])
    assert.equal(
      dispatch(clock, other).responses[0].error,
      "Unsupported request sender",
    );
  assert.equal(received.length, 1);
});

test("extra danmaku source status accepts an optional loading flag", () => {
  const { dispatcher, dispatch } = createDispatcher();
  const received = [];
  dispatcher.addListener("EXTRA_DANMAKU_SOURCE_STATUS", (message) =>
    received.push(message),
  );
  const sender = {
    frameId: 0,
    tab: { id: 1, url: "https://www.twitch.tv/channel" },
    url: "https://www.twitch.tv/channel",
  };
  const status = {
    type: "EXTRA_DANMAKU_SOURCE_STATUS",
    error: null,
    revision: 1,
  };
  assert.equal(dispatch(status, sender).responses.length, 0);
  assert.equal(received.length, 1);
  assert.equal(
    dispatch({ ...status, revision: 2, loading: true }, sender).responses
      .length,
    0,
  );
  assert.equal(received.length, 2);
  assert.equal(
    dispatch({ ...status, revision: 3, loading: "yes" }, sender).responses[0]
      .error,
    "Invalid message",
  );
  assert.equal(received.length, 2);
});
