import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

for (const pauseOnPipClose of [true, false]) {
  test(`embedded videos respect pause on PiP close (${pauseOnPipClose}) without moving the player`, async () => {
    const messages = [];
    const handlers = new Map();
    const parent = {};
    const iframeDocument = {
      pictureInPictureElement: null,
      async exitPictureInPicture() {
        this.pictureInPictureElement = null;
        for (const handler of handlers.get("leavepictureinpicture") ?? [])
          handler();
      },
    };
    const video = {
      ownerDocument: iframeDocument,
      parentNode: parent,
      paused: false,
      pause() {
        this.paused = true;
      },
      addEventListener(type, handler) {
        const listeners = handlers.get(type) ?? [];
        listeners.push(handler);
        handlers.set(type, listeners);
      },
      removeEventListener(type, handler) {
        handlers.set(
          type,
          (handlers.get(type) ?? []).filter((listener) => listener !== handler),
        );
      },
      async requestPictureInPicture() {
        iframeDocument.pictureInPictureElement = this;
      },
    };
    const state = {
      pauseOnPipClose,
      pipSession: { phase: "closed" },
      sourceVideo: video,
      videoStash: null,
      subtitlessOn: false,
      get pipWindow() {
        return null;
      },
      get pipUi() {
        return null;
      },
    };
    const context = {
      state,
      document: {},
      window: { clearTimeout() {}, clearInterval() {} },
      chrome: {
        runtime: {
          id: "test-extension",
          sendMessage(msg) {
            messages.push(msg);
            return Promise.resolve({ ok: false });
          },
        },
      },
      PipCompanion: {
        util: { getMessage: (key) => key },
        ContentPlayback: { cancelNextVideoRequest() {} },
        ContentVideo: {
          getDocumentPip() {
            assert.fail("embedded videos must not open a document PiP window");
          },
        },
      },
    };
    const source = readFileSync(
      new URL("../src/content/pip/lifecycle.ts", import.meta.url),
      "utf8",
    );
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText,
      context,
    );

    const lifecycle = context.PipCompanion.ContentPipLifecycle;
    assert.equal((await lifecycle.openPiP()).ok, true);
    assert.equal(iframeDocument.pictureInPictureElement, video);
    assert.equal(video.parentNode, parent);
    assert.equal(lifecycle.isPipOpen(), true);
    assert.equal(
      messages.some((msg) => msg.type === "PIP_STATE_CHANGED" && msg.pipOpen),
      true,
    );

    await lifecycle.closePiP(true);
    assert.equal(iframeDocument.pictureInPictureElement, null);
    assert.equal(video.parentNode, parent);
    assert.equal(lifecycle.isPipOpen(), false);
    assert.equal(video.paused, pauseOnPipClose);
    assert.equal(
      messages.some((msg) => msg.type === "PIP_STATE_CHANGED" && !msg.pipOpen),
      true,
    );

    video.paused = false;
    assert.equal((await lifecycle.openPiP()).ok, true);
    await iframeDocument.exitPictureInPicture();
    assert.equal(video.paused, pauseOnPipClose);
    assert.equal(lifecycle.isPipOpen(), false);

    video.paused = false;
    assert.equal((await lifecycle.openPiP()).ok, true);
    const replacement = {
      ownerDocument: iframeDocument,
      parentNode: parent,
      paused: false,
      pause() {
        this.paused = true;
      },
      addEventListener(type, handler) {
        const listeners = handlers.get(type) ?? [];
        listeners.push(handler);
        handlers.set(type, listeners);
      },
      removeEventListener(type, handler) {
        handlers.set(
          type,
          (handlers.get(type) ?? []).filter((listener) => listener !== handler),
        );
      },
      async requestPictureInPicture() {
        iframeDocument.pictureInPictureElement = this;
      },
    };
    await lifecycle.handoffNativePipVideo(replacement);
    assert.equal(iframeDocument.pictureInPictureElement, replacement);
    assert.equal(lifecycle.getActivePipSource().video, replacement);
    assert.equal(video.paused, false);
    await lifecycle.closePiP(true);
    assert.equal(replacement.paused, pauseOnPipClose);

    let resolvePiPRequest;
    video.requestPictureInPicture = () =>
      new Promise((resolve) => {
        resolvePiPRequest = () => {
          iframeDocument.pictureInPictureElement = video;
          resolve();
        };
      });

    const opening = lifecycle.openPiP();
    const closing = lifecycle.closePiP(true);
    resolvePiPRequest();
    await Promise.all([opening, closing]);

    assert.equal(iframeDocument.pictureInPictureElement, null);
    assert.equal(lifecycle.isPipOpen(), false);
  });
}

test("document PiP closes a window that resolves after a rapid cancel", async () => {
  const messages = [];
  let resolveWindow;
  const documentPip = {
    requestWindow() {
      return new Promise((resolve) => {
        resolveWindow = resolve;
      });
    },
  };
  const pipDocument = {
    head: { replaceChildren() {} },
    body: { append() {} },
    createElement() {
      return {
        setAttribute() {},
        style: {},
        textContent: "",
      };
    },
  };
  const pipWindow = {
    closed: false,
    document: pipDocument,
    innerWidth: 640,
    outerWidth: 640,
    outerHeight: 360,
    screenX: 0,
    screenY: 0,
    screen: { availWidth: 1920, availHeight: 1080 },
    addEventListener() {},
    close() {
      this.closed = true;
    },
  };
  const state = {
    pipSession: { phase: "closed" },
    sourceVideo: null,
    videoStash: null,
    subtitlessOn: false,
    get pipWindow() {
      return this.pipSession.phase === "waiting" ||
        this.pipSession.phase === "active"
        ? this.pipSession.window
        : null;
    },
    get pipUi() {
      return null;
    },
    feedbackTimer: 0,
    nextClickTimer: 0,
    nextClickPending: false,
    subtitleObserver: null,
    subtitleNode: null,
    subtitleExtract: null,
    subtitleLines: [],
  };
  const context = {
    state,
    document: {},
    window: {
      clearTimeout() {},
      clearInterval() {},
      setTimeout() {
        return 1;
      },
      setInterval() {
        return 1;
      },
    },
    chrome: {
      runtime: {
        id: "test-extension",
        sendMessage(msg) {
          messages.push(msg);
          return Promise.resolve({ ok: true });
        },
      },
    },
    PipCompanion: {
      util: { getMessage: (key) => key },
      ContentPlayback: { cancelNextVideoRequest() {} },
      ContentVideo: { getDocumentPip: () => documentPip },
      PipAudio: { prepare() {} },
    },
  };
  const source = readFileSync(
    new URL("../src/content/pip/lifecycle.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  const lifecycle = context.PipCompanion.ContentPipLifecycle;
  const opening = lifecycle.openPiP();
  const closing = lifecycle.closePiP(true);
  resolveWindow(pipWindow);
  await Promise.all([opening, closing]);

  assert.equal(pipWindow.closed, true);
  assert.equal(lifecycle.isPipOpen(), false);
  assert.equal(
    messages.some((msg) => msg.type === "PIP_STATE_CHANGED" && msg.pipOpen),
    false,
  );
});

test("document PiP reports an invalidated extension context", async () => {
  const documentPip = {
    requestWindow() {
      return Promise.reject(new Error("Extension context invalidated"));
    },
  };
  const state = {
    pipSession: { phase: "closed" },
    sourceVideo: null,
    videoStash: null,
    subtitlessOn: false,
    get pipWindow() {
      return null;
    },
    get pipUi() {
      return null;
    },
  };
  const context = {
    state,
    document: {},
    DOMException,
    window: {
      clearTimeout() {},
      clearInterval() {},
      setTimeout() {
        return 1;
      },
      setInterval() {
        return 1;
      },
    },
    chrome: {
      runtime: {
        id: "test-extension",
        sendMessage() {
          return Promise.resolve({ ok: true });
        },
      },
    },
    PipCompanion: {
      util: { getMessage: (key) => key },
      ContentPlayback: { cancelNextVideoRequest() {} },
      ContentVideo: { getDocumentPip: () => documentPip },
      PipAudio: { prepare() {} },
    },
  };
  const source = readFileSync(
    new URL("../src/content/pip/lifecycle.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  const lifecycle = context.PipCompanion.ContentPipLifecycle;
  const result = await lifecycle.openPiP();
  assert.equal(result.ok, false);
  assert.equal(result.message, "pipExtensionContextInvalidated");
});

test("stalled PiP recovery does not overwrite a later seek", async () => {
  let now = 0;
  let resolvePlay;
  let pendingPlay = false;
  const videoListeners = new Map();
  const parent = {
    isConnected: true,
    insertBefore() {},
  };
  const document = {
    createElement() {
      return {
        style: {},
        setAttribute() {},
        remove() {},
      };
    },
  };
  const video = {
    ownerDocument: document,
    parentNode: parent,
    nextSibling: null,
    isConnected: true,
    paused: false,
    ended: false,
    readyState: 2,
    videoWidth: 640,
    currentTime: 10,
    playbackRate: 1,
    controls: true,
    style: { cssText: "" },
    getBoundingClientRect() {
      return { width: 640, height: 360 };
    },
    addEventListener(type, listener) {
      const listeners = videoListeners.get(type) ?? [];
      listeners.push(listener);
      videoListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      videoListeners.set(
        type,
        (videoListeners.get(type) ?? []).filter(
          (candidate) => candidate !== listener,
        ),
      );
    },
    requestVideoFrameCallback() {
      return 1;
    },
    cancelVideoFrameCallback() {},
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      if (pendingPlay)
        return new Promise((resolve) => {
          resolvePlay = resolve;
        });
      return Promise.resolve();
    },
  };
  const pipDocument = {
    head: { replaceChildren() {} },
    body: { append() {} },
    querySelector() {
      return this.body;
    },
    createElement() {
      return { style: {}, setAttribute() {}, remove() {} };
    },
  };
  const pipWindow = {
    closed: false,
    document: pipDocument,
    innerWidth: 640,
    outerWidth: 640,
    outerHeight: 360,
    screenX: 0,
    screenY: 0,
    screen: { availWidth: 1920, availHeight: 1080 },
    addEventListener() {},
    close() {
      this.closed = true;
    },
  };
  const state = {
    pipSession: { phase: "closed" },
    sourceVideo: video,
    sourceAbort: null,
    videoStash: null,
    subtitlessOn: false,
    seekSeconds: 5,
    commentsEnabled: true,
    danmakuEnabled: true,
    screenshotEnabled: true,
    thumbnailPreviewEnabled: false,
    subtitleTranslationPreferences: {},
    feedbackTimer: 0,
    nextClickTimer: 0,
    nextClickPending: false,
    subtitleObserver: null,
    subtitleNode: null,
    subtitleExtract: null,
    subtitleLines: [],
    get pipWindow() {
      return this.pipSession.phase === "waiting" ||
        this.pipSession.phase === "active"
        ? this.pipSession.window
        : null;
    },
    get pipUi() {
      return this.pipSession.phase === "active" ? this.pipSession.ui : null;
    },
  };
  const documentPip = { requestWindow: async () => pipWindow };
  const context = {
    state,
    document,
    console,
    location: { hostname: "example.test" },
    DOMException,
    getComputedStyle: () => ({ display: "block" }),
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    performance: { now: () => now },
    window: {
      clearTimeout() {},
      clearInterval() {},
      setTimeout() {
        return 1;
      },
      setInterval() {
        return 1;
      },
    },
    chrome: {
      runtime: {
        id: "test-extension",
        sendMessage(msg) {
          if (msg.type === "GET_PIP_BOUNDS")
            return Promise.resolve({ ok: false });
          return Promise.resolve({ ok: true });
        },
      },
    },
    PipCompanion: {
      util: { getMessage: (key) => key },
      site: { isHahowHost: () => false },
      ContentPlayback: {
        VOLUME_ICON_PATH: "",
        cancelNextVideoRequest() {},
        updatePlaybackUi() {},
      },
      ContentVideo: { getDocumentPip: () => documentPip },
      ContentSubtitles: {
        initializeSubtitlesOn() {},
        refreshSubtitle() {},
        prepareNativeSubtitles() {},
        restoreNativeSubtitleModes() {},
      },
      ContentStoryboard: { reset() {} },
      ContentFeedback: {
        showFeedback() {},
        showVolumeFeedback() {},
        showFrameStepIcon() {},
      },
      ContentScreenshot: { savePipScreenshot() {} },
      ContentDanmakuSender: { getCharacterLimit: () => 100, send() {} },
      ContentPlatform: { getCapabilities: () => ({ danmakuSend: false }) },
      PipAudio: {
        prepare() {},
        start() {
          return true;
        },
        stop() {},
        maxVolume: () => 1,
      },
      PipUI: {
        create: (_window, _actions, pipVideo) => ({
          video: pipVideo,
          setVideo(nextVideo) {
            this.video = nextVideo;
          },
          screen: { append() {} },
          setThumbnailPreviewEnabled() {},
          setDanmakuEnabled() {},
          refreshSubtitleTracks() {},
          dispose() {},
        }),
      },
    },
  };
  const source = readFileSync(
    new URL("../src/content/pip/lifecycle.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(
      `function initDanmakuInPip() {}\nfunction destroyDanmakuInPip() {}\nfunction toggleFloatingComments() {}\n${source}`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );

  const lifecycle = context.PipCompanion.ContentPipLifecycle;
  const openResult = await lifecycle.openPiP();
  assert.equal(openResult.ok, true, JSON.stringify(openResult));
  now = 3000;
  assert.equal(
    lifecycle.isPipVideoStalled(),
    true,
    JSON.stringify({ paused: video.paused, readyState: video.readyState }),
  );

  pendingPlay = true;
  assert.equal(lifecycle.recoverStalledPipVideo(), true);
  video.currentTime = 30;
  resolvePlay();
  await Promise.resolve();
  assert.equal(video.currentTime, 30);
  await lifecycle.closePiP(true);
});
