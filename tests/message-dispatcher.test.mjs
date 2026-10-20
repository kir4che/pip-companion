import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function createDispatcher(environment = "background") {
  let runtimeListener;
  let registrations = 0;
  const register = (listener) => {
    runtimeListener = listener;
    registrations++;
  };
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
  const utilsContext = {
    URL,
    console: { error: (...args) => errors.push(args) },
    navigator: { platform: "Linux" },
    chrome: {
      i18n: { getUILanguage: () => "en-US", getMessage: () => "" },
      runtime: { onMessage: { addListener: register }, getURL: () => "" },
    },
    PipCompanion: {
      locales: {},
      isValidExtraDanmakuSourceUrl: () => true,
    },
  };
  const utilsSource = readFileSync(
    new URL("../src/shared/utils.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(utilsSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    }).outputText,
    utilsContext,
  );
  const context = {
    URL,
    exports: {},
    PipCompanion: utilsContext.PipCompanion,
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
        onMessage: { addListener: register },
        getURL: () => "",
      },
    },
  };
  const source = readFileSync(
    new URL("../src/background/message-dispatcher.ts", import.meta.url),
    "utf8",
  );
  if (environment === "background")
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
    dispatcher:
      environment === "background"
        ? context.exports.runtimeMessageDispatcher
        : utilsContext.PipCompanion.runtimeMessages,
    errors,
    registrations: () => registrations,
    dispatch: (msg, sender = {}) => {
      const responses = [];
      const keepChannelOpen = runtimeListener(msg, sender, (res) =>
        responses.push(res),
      );
      return { keepChannelOpen, responses };
    },
  };
}

for (const environment of ["background", "content/popup"]) {
  test(`${environment}: registers one listener, deduplicates handlers and ignores unknown or unhandled messages`, () => {
    const { dispatcher, dispatch, registrations } =
      createDispatcher(environment);
    const received = [];
    const handler = (msg) => {
      received.push(msg.type);
    };
    dispatcher.addListener(["GET_PIP_STATE", "PING"], handler);
    dispatcher.addListener("GET_PIP_STATE", handler);
    assert.equal(registrations(), 1);
    for (const type of ["GET_PIP_STATE", "PING"])
      assert.equal(dispatch({ type }).keepChannelOpen, false);
    assert.deepEqual(received, ["GET_PIP_STATE", "PING"]);
    for (const message of [
      null,
      {},
      { type: "UNKNOWN" },
      { type: "OPEN_PIP" },
    ]) {
      const result = dispatch(message);
      assert.equal(result.keepChannelOpen, false);
      assert.equal(result.responses.length, 0);
    }
    const invalid = dispatch({ type: "PIP_STATE_CHANGED", pipOpen: "yes" });
    assert.equal(invalid.keepChannelOpen, false);
    assert.equal(invalid.responses[0].error, "Invalid message");
    assert.equal(received.length, 2);
  });

  test(`${environment}: sends only the first response while running every handler`, async () => {
    const { dispatcher, dispatch, errors } = createDispatcher(environment);
    const received = [];
    dispatcher.addListener("GET_PIP_STATE", (_message, _sender, respond) => {
      respond({ ok: true });
      respond({ ok: false });
    });
    dispatcher.addListener(
      "GET_PIP_STATE",
      async (_message, _sender, respond) => {
        await Promise.resolve();
        received.push("async");
        respond({ late: true });
        throw new Error("late rejection");
      },
    );
    dispatcher.addListener("GET_PIP_STATE", () => {
      received.push("sync");
      throw new Error("late throw");
    });
    const result = dispatch({ type: "GET_PIP_STATE" });
    assert.equal(result.keepChannelOpen, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(received, ["sync", "async"]);
    assert.equal(result.responses.length, 1);
    assert.equal(result.responses[0].ok, true);
    assert.equal(errors.length, 2);
  });

  test(`${environment}: keeps callback and Promise channels open and handles sync/async failures`, async () => {
    for (const asynchronous of [false, true]) {
      const { dispatcher, dispatch, errors } = createDispatcher(environment);
      dispatcher.addListener("GET_PIP_STATE", () => {
        if (asynchronous) return Promise.reject(new Error("async"));
        throw new Error("sync");
      });
      const result = dispatch({ type: "GET_PIP_STATE" });
      assert.equal(result.keepChannelOpen, asynchronous);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(result.responses.length, 1);
      assert.equal(result.responses[0].ok, false);
      assert.equal(errors.length, 1);
    }
    const { dispatcher, dispatch } = createDispatcher(environment);
    let callback;
    dispatcher.addListener("GET_PIP_STATE", (_message, _sender, respond) => {
      callback = respond;
      return true;
    });
    const result = dispatch({ type: "GET_PIP_STATE" });
    assert.equal(result.keepChannelOpen, true);
    callback({ ok: true });
    assert.equal(result.responses[0].ok, true);
  });
}

test("routes only schema-valid messages to handlers registered for their type", () => {
  const { dispatcher, dispatch } = createDispatcher();
  const received = [];
  dispatcher.addListener("GET_BILIBILI_DANMAKU", (msg, sender) => {
    received.push({ message: msg, sender });
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

  const bangumiRequest = {
    type: "GET_BILIBILI_DANMAKU",
    epId: "476877",
    page: 1,
  };
  dispatch(bangumiRequest, sender);
  assert.equal(received.length, 2);
  assert.equal(received[1].message, bangumiRequest);

  dispatch({ type: "GET_PIP_STATE" });
  assert.equal(received[2], "pip-state");
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
  dispatcher.addListener("EXTRA_YOUTUBE_CHAT_CLOCK", (msg) =>
    received.push(msg),
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
  dispatcher.addListener("EXTRA_YOUTUBE_CHAT_CLOCK", (msg) =>
    received.push(msg),
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
  dispatcher.addListener("EXTRA_DANMAKU_SOURCE_STATUS", (msg) =>
    received.push(msg),
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
