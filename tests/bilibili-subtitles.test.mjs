import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup({ nativeTracks = [], active = true } = {}) {
  const listeners = [];
  const posted = [];
  const requests = [];
  const events = [];
  const window = {
    addEventListener: (_type, listener) => listeners.push(listener),
    postMessage: (message) => posted.push(message),
    setTimeout,
    clearTimeout,
  };
  const context = {
    window,
    URL,
    location: {
      href: "https://www.bilibili.com/video/BV1234567890",
      origin: "https://www.bilibili.com",
    },
    IS_BILIBILI: active,
    state: {
      pipUi: {},
      sourceVideo: { currentSrc: "video-1", textTracks: nativeTracks },
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          return new Promise((resolve, reject) => {
            requests.push({ message, resolve, reject });
          });
        },
      },
    },
    PipCompanion: {
      util: {
        isRecord: (value) =>
          value !== null && typeof value === "object" && !Array.isArray(value),
      },
      standardTextTrack: { getTracks: () => nativeTracks },
    },
  };
  const source = readFileSync(
    new URL("../src/content/subtitles/bilibili.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const controller = context.PipCompanion.BilibiliSubtitles.create({
    onVideoChange: () => events.push("video"),
    onTracksChanged: () => events.push("tracks"),
    onCuesChanged: () => events.push("cues"),
    onFailure: () => events.push("failure"),
  });
  const tracks = [
    { key: "ai", label: "AI", language: "en", isAi: true },
    { key: "human", label: "中文", language: "zh", isAi: false },
  ].map((track) => ({
    ...track,
    subtitleUrl: `https://aisubtitle.hdslb.com/${track.key}.json`,
  }));
  const respond = (overrides = {}) => {
    const event = {
      source: window,
      origin: context.location.origin,
      data: {
        type: "PIP_BILI_SUBTITLE_TRACKS",
        requestId: posted.at(-1)?.requestId,
        ok: true,
        tracks,
      },
      ...overrides,
    };
    for (const listener of listeners) listener(event);
  };
  return { controller, context, posted, requests, events, tracks, respond };
}

function setupSubtitles({
  nativeEnabled = null,
  overlayText = "",
  overlayClass = "",
  platform = "bilibili",
} = {}) {
  const fixture = setup();
  const { context } = fixture;
  const nativeState = { enabled: nativeEnabled };
  const overlay = {
    className: overlayClass,
    innerText: overlayText,
    querySelector: () => null,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 100, top: 100, bottom: 120 }),
  };
  Object.assign(context, {
    IS_YOUTUBE: platform === "youtube",
    IS_BILIBILI: platform === "bilibili",
    getComputedStyle: () => ({ position: "absolute", pointerEvents: "none" }),
    document: {
      documentElement: { dataset: { pipYtVideoId: "video-1" } },
      addEventListener() {},
      querySelector: (selector) => {
        if (
          selector === ".bpx-player-ctrl-subtitle-close-switch.bpx-state-active"
        )
          return nativeState.enabled === false ? {} : null;
        if (
          selector ===
          ".bpx-player-ctrl-subtitle-language-item.bpx-state-active"
        )
          return nativeState.enabled === true ? {} : null;
        return null;
      },
      querySelectorAll: (selector) => {
        if (
          overlayClass === "vjs-text-track-display" &&
          !selector.includes("text-track-display")
        )
          return [];
        return overlayText || overlayClass ? [overlay] : [];
      },
    },
  });
  Object.assign(context.state, {
    pipUi: {
      refreshSubtitleTracks() {},
      refreshSubtitleTranslationPreferences() {},
      subtitle: { hidden: true },
    },
    subtitlessOn: false,
  });
  Object.assign(context.PipCompanion, {
    util: { ...context.PipCompanion.util, getMessage: (key) => key },
    ContentFeedback: {
      showFeedback: (message) => fixture.events.push(message),
    },
    site: {
      isNetflixHost: () => platform === "netflix",
      isHahowHost: () => false,
    },
    NativeSecondarySubtitleTrack: {
      create: () => ({ getTrack: () => null, clear() {} }),
    },
    SubtitleTranslation: { create: () => ({ onSubtitlesEnabledChanged() {} }) },
    standardTextTrack: {
      getTracks: () => [],
      getSelectedTrack: () => null,
    },
  });
  const subtitleRenderingSource = readFileSync(
    new URL("../src/content/subtitles/subtitle-rendering.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(subtitleRenderingSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const cueDataSource = readFileSync(
    new URL("../src/content/subtitles/cue-data.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(cueDataSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const overlayDetectionSource = readFileSync(
    new URL(
      "../src/content/subtitles/generic-overlay-detection.ts",
      import.meta.url,
    ),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(overlayDetectionSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const languageTagsSource = readFileSync(
    new URL("../src/shared/subtitle-language-tags.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(languageTagsSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const trackOptionsSource = readFileSync(
    new URL("../src/content/subtitles/track-options.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(trackOptionsSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const remoteRequestsSource = readFileSync(
    new URL("../src/content/subtitles/remote-requests.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(remoteRequestsSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  let remoteRequests;
  const createRemoteRequests =
    context.PipCompanion.subtitleRemoteRequests.create;
  context.PipCompanion.subtitleRemoteRequests.create = (options) => {
    remoteRequests = createRemoteRequests(options);
    return remoteRequests;
  };
  const subtitleClockSource = readFileSync(
    new URL("../src/content/subtitles/subtitle-clock.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(subtitleClockSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const nativeSubtitleModesSource = readFileSync(
    new URL(
      "../src/content/subtitles/native-subtitle-modes.ts",
      import.meta.url,
    ),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(nativeSubtitleModesSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const subtitleFitControllerSource = readFileSync(
    new URL(
      "../src/content/subtitles/subtitle-fit-controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(subtitleFitControllerSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const source = readFileSync(
    new URL("../src/content/subtitles/index.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return {
    ...fixture,
    subtitles: context.PipCompanion.ContentSubtitles,
    nativeState,
    remoteRequests,
  };
}

test("YouTube cue receivers discard stale tracks, videos and untrusted events", () => {
  const { subtitles, remoteRequests, context, posted, respond } =
    setupSubtitles({ platform: "youtube" });
  context.state.pipUi = null;
  remoteRequests.state.youtubeTracks = [
    { key: "en", selected: true, canLoadCues: true },
    { key: "zh", selected: false, canLoadCues: true },
    { key: "ja", selected: false, canLoadCues: true },
  ];
  remoteRequests.requestYouTubePrimaryCues();
  const primaryRequest = posted.at(-1);
  subtitles.selectSecondarySubtitleTrack("youtube:zh");
  const secondaryRequest = posted.at(-1);
  const data = (request) => ({
    ...request,
    type: "PIP_YT_SUBTITLE_CUES",
    videoId: "video-1",
    ok: true,
    cues: [cue],
  });
  respond({ data: { ...data(primaryRequest), videoId: "old-video" } });
  respond({ data: data(primaryRequest), origin: "https://other.example" });
  respond({ data: data(primaryRequest), source: {} });
  assert.equal(remoteRequests.youtubePrimary.cues, null);
  respond({ data: data(primaryRequest) });
  assert.equal(remoteRequests.youtubePrimary.loadedTrack, "en");
  assert.equal(remoteRequests.youtubePrimary.cues.length, 1);
  // 切換第二字幕軌會使先前的回應失效，不影響主字幕資料。
  subtitles.selectSecondarySubtitleTrack("youtube:ja");
  respond({ data: data(secondaryRequest) });
  assert.equal(remoteRequests.youtubeSecondary.trackKey, "ja");
  assert.equal(remoteRequests.youtubeSecondary.cues, null);
  assert.equal(remoteRequests.youtubePrimary.loadedTrack, "en");
  subtitles.selectNativeSubtitleTrack("youtube:ja");
  assert.equal(subtitles.getSelectedSecondarySubtitleTrack(), "");
  remoteRequests.reset();
  respond({ data: data(primaryRequest) });
  assert.equal(remoteRequests.youtubePrimary.cues, null);
});

test("YouTube secondary receivers complete valid requests and release failed pending requests", () => {
  const { subtitles, remoteRequests, context, posted, respond } =
    setupSubtitles({ platform: "youtube" });
  context.state.pipUi = null;
  remoteRequests.state.youtubeTracks = [
    { key: "zh", selected: false, canLoadCues: true },
  ];
  subtitles.selectSecondarySubtitleTrack("youtube:zh");
  const request = posted.at(-1);
  respond({
    data: {
      ...request,
      type: "PIP_YT_SUBTITLE_CUES",
      videoId: "video-1",
      ok: false,
      cues: [],
    },
  });
  assert.equal(remoteRequests.youtubeSecondary.pendingTrack, "");
  assert.equal(remoteRequests.youtubeSecondary.loadedTrack, "");
  remoteRequests.youtubeSecondary.reset("zh");
  remoteRequests.requestYouTubeSecondaryCues();
  respond({
    data: {
      ...posted.at(-1),
      type: "PIP_YT_SUBTITLE_CUES",
      videoId: "video-1",
      ok: true,
      cues: [cue],
    },
  });
  assert.equal(remoteRequests.youtubeSecondary.loadedTrack, "zh");
  assert.equal(remoteRequests.youtubeSecondary.cues.length, 1);
});

test("Netflix cue receivers retain restoration retries, caching and track invalidation", () => {
  const { subtitles, remoteRequests, context, posted, respond } =
    setupSubtitles({ platform: "netflix" });
  context.state.pipUi = null;
  const timers = new Map();
  let nextTimer = 0;
  context.window.setTimeout = (callback) => {
    timers.set(++nextTimer, callback);
    return nextTimer;
  };
  context.window.clearTimeout = (id) => timers.delete(id);
  remoteRequests.state.netflixTracks = [
    { key: "zh", selected: false },
    { key: "ja", selected: false },
  ];
  subtitles.selectSecondarySubtitleTrack("netflix:zh");
  const original = posted.at(-1);
  const data = (request, restored = false) => ({
    ...request,
    type: "PIP_NETFLIX_SUBTITLE_CUES",
    restored,
    cues: [cue],
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const request = posted.at(-1);
    respond({ data: data(request) });
    assert.equal(remoteRequests.netflixSecondary.pendingTrack, "");
    assert.equal(remoteRequests.netflixSecondary.loadedTrack, "");
    assert.equal(
      remoteRequests.state.netflixSecondaryCueRetryCount,
      attempt + 1,
    );
    const timer = remoteRequests.state.netflixSecondaryCueRetryTimer;
    const callback = timers.get(timer);
    timers.delete(timer);
    callback();
    assert.equal(posted.at(-1).type, "PIP_REQUEST_NETFLIX_SUBTITLE_CUES");
    assert.ok(posted.at(-1).requestId > request.requestId);
  }
  respond({ data: data(posted.at(-1)) });
  assert.equal(timers.size, 0);
  subtitles.selectSecondarySubtitleTrack("netflix:ja");
  const current = posted.at(-1);
  respond({ data: data(original, true) });
  assert.equal(remoteRequests.netflixSecondary.cues, null);
  respond({ data: data(current, true) });
  assert.equal(remoteRequests.netflixSecondary.loadedTrack, "ja");
  assert.equal(remoteRequests.netflixSecondary.cues.length, 1);
  assert.equal(remoteRequests.state.netflixSecondaryCueRetryCount, 0);
  const count = posted.length;
  remoteRequests.requestNetflixSecondaryCues();
  assert.equal(posted.length, count);
  subtitles.selectNativeSubtitleTrack("netflix:ja");
  respond({ data: data(current, true) });
  assert.equal(remoteRequests.netflixSecondary.cues, null);
});

test("PiP inherits native subtitles enabled even between caption cues", () => {
  const { subtitles, context } = setupSubtitles({ nativeEnabled: true });
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, true);
});

test("PiP inherits native subtitles disabled even with stale overlay text", () => {
  const { subtitles, context } = setupSubtitles({
    nativeEnabled: false,
    overlayText: "上一句字幕",
  });
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, false);
});

test("reopening PiP re-reads the native subtitle switch", () => {
  const { subtitles, context, nativeState } = setupSubtitles({
    nativeEnabled: true,
  });
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, true);
  nativeState.enabled = false;
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, false);
  nativeState.enabled = true;
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, true);
});

test("unknown native switch retains the existing overlay fallback", () => {
  const { subtitles, context } = setupSubtitles({ overlayText: "字幕" });
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, true);
});

test("generic subtitle overlay detection prefers visible, populated captions", () => {
  const { context } = setupSubtitles();
  const makeElement = ({
    text = "caption",
    width = 100,
    top = 10,
    bottom = 30,
    child = false,
    closest = false,
    contains = () => false,
  } = {}) => ({
    innerText: text,
    querySelector: () => (child ? {} : null),
    closest: () => (closest ? {} : null),
    contains,
    getBoundingClientRect: () => ({ width, top, bottom }),
  });
  const nested = makeElement({ text: "nested" });
  const preferred = makeElement({
    text: "visible",
    contains: (element) => element === nested,
  });
  const blank = makeElement({ text: "" });
  const candidates = [
    makeElement({ text: "offscreen", top: 800, bottom: 820 }),
    makeElement({ text: "too small", width: 20 }),
    makeElement({ text: "controls", closest: true }),
    makeElement({ text: "interactive", child: true }),
    nested,
    blank,
    preferred,
  ];
  context.document.querySelectorAll = () => candidates;
  const detected =
    context.PipCompanion.genericSubtitleOverlayDetection.findNode(
      context.document,
      (element) =>
        element === candidates[0]
          ? { position: "static", pointerEvents: "none" }
          : { position: "absolute", pointerEvents: "none" },
      600,
    );
  assert.equal(detected, preferred);
});

test("detects Video.js captions rendered outside native text tracks", () => {
  const { subtitles, context } = setupSubtitles({
    overlayText: "Eine sichtbare Untertitelzeile",
    overlayClass: "vjs-text-track-display",
  });
  subtitles.initializeSubtitlesOn();
  assert.equal(context.state.subtitlessOn, true);
});

test("PiP discovers AI subtitle languages even when subtitle display is off", () => {
  const { context, posted, requests, respond, subtitles } = setupSubtitles();
  subtitles.refreshSubtitle(true);
  assert.equal(posted.length, 1);
  respond({
    data: {
      type: "PIP_BILI_SUBTITLE_TRACKS",
      requestId: posted[0].requestId,
      ok: true,
      tracks: [
        {
          key: "ai-en",
          label: "English (AI)",
          language: "en",
          subtitleUrl: "//aisubtitle.hdslb.com/subtitle.json",
          isAi: true,
        },
      ],
    },
  });
  const tracks = subtitles.getNativeSubtitleTracks();
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].language, "en");
  assert.equal(tracks[0].label, "English (AI)");
  assert.equal(context.state.subtitlessOn, false);
  assert.equal(requests.length, 0);
  subtitles.refreshSubtitle(true);
  assert.equal(posted.length, 1);
});

const cue = { from: 1, to: 3, content: "字幕" };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("track discovery validates the bridge response and prefers non-AI tracks", () => {
  const { controller, posted, respond, tracks, events } = setup();
  controller.requestTracks();
  controller.requestTracks();
  assert.equal(posted.length, 1);
  respond({ origin: "https://example.com" });
  respond({ source: {} });
  respond({
    data: { type: "PIP_BILI_SUBTITLE_TRACKS", requestId: -1, ok: true, tracks },
  });
  assert.equal(controller.tracks.length, 0);
  respond({
    data: {
      ...posted[0],
      type: "PIP_BILI_SUBTITLE_TRACKS",
      ok: true,
      tracks: [
        ...tracks,
        {
          ...tracks[0],
          key: "bad",
          subtitleUrl: "https://example.com/subtitle.json",
        },
      ],
    },
  });
  assert.equal(controller.tracks.length, 2);
  assert.equal(controller.primaryKey, "human");
  controller.requestTracks();
  assert.equal(posted.length, 1);
  assert.deepEqual(events, ["video", "tracks"]);
});

test("native tracks retain priority; inactive or absent videos do not request tracks", () => {
  const native = setup({ nativeTracks: [{}] });
  native.controller.requestTracks();
  native.respond();
  assert.equal(native.controller.primaryKey, "");
  const inactive = setup({ active: false });
  inactive.controller.requestTracks();
  assert.equal(inactive.posted.length, 0);
  const missing = setup();
  missing.context.state.sourceVideo = null;
  missing.controller.requestTracks();
  assert.equal(missing.posted.length, 0);
});

test("primary and secondary selections deduplicate loads and discard stale responses", async () => {
  const { controller, requests, respond } = setup();
  controller.requestTracks();
  respond();
  assert.equal(controller.selectSecondary("human"), false);
  assert.equal(controller.selectSecondary("missing"), false);
  assert.equal(controller.selectPrimary("missing"), false);
  controller.loadTrack(controller.primaryKey);
  controller.loadTrack(controller.primaryKey);
  assert.equal(requests.length, 1);
  assert.equal(controller.selectSecondary("ai"), true);
  controller.loadTrack(controller.secondaryKey, true);
  controller.loadTrack(controller.secondaryKey, true);
  assert.equal(requests.length, 2);
  requests[0].resolve({
    ok: true,
    cues: [cue, { from: 3, to: 1, content: "bad" }],
  });
  requests[1].resolve({ ok: true, cues: [cue] });
  await flush();
  assert.equal(JSON.stringify(controller.primaryCues), JSON.stringify([cue]));
  assert.equal(JSON.stringify(controller.secondaryCues), JSON.stringify([cue]));
  controller.loadTrack(controller.primaryKey);
  assert.equal(requests.length, 2);
  controller.selectSecondary("ai");
  controller.loadTrack("ai", true);
  controller.selectPrimary("ai");
  assert.equal(controller.secondaryKey, "");
  requests[2].resolve({ ok: true, cues: [cue] });
  await flush();
  assert.equal(controller.secondaryCues, null);
  controller.loadTrack("ai");
  controller.clearPrimary();
  requests[3].resolve({ ok: true, cues: [cue] });
  await flush();
  assert.equal(controller.primaryCues, null);
});

test("video changes and reset invalidate pending track and cue requests", async () => {
  const { controller, context, requests, posted, respond, tracks, events } =
    setup();
  controller.requestTracks();
  respond();
  controller.loadTrack(controller.primaryKey);
  controller.selectSecondary("ai");
  controller.loadTrack("ai", true);
  const oldRequestId = posted[0].requestId;
  context.state.sourceVideo.currentSrc = "video-2";
  controller.requestTracks();
  assert.equal(posted.length, 2);
  assert.equal(controller.primaryKey, "");
  assert.equal(controller.secondaryKey, "");
  respond({
    data: {
      type: "PIP_BILI_SUBTITLE_TRACKS",
      requestId: oldRequestId,
      ok: true,
      tracks,
    },
  });
  assert.equal(controller.tracks.length, 0);
  requests[0].resolve({ ok: true, cues: [cue] });
  requests[1].reject(new Error("old request"));
  await flush();
  assert.equal(controller.primaryCues, null);
  assert.equal(controller.secondaryCues, null);
  assert.equal(events.includes("failure"), false);
  respond();
  controller.loadTrack(controller.primaryKey);
  controller.reset();
  requests[2].resolve({ ok: true, cues: [cue] });
  await flush();
  assert.equal(controller.tracks.length, 0);
  assert.equal(controller.primaryCues, null);
  controller.requestTracks();
  assert.equal(posted.length, 3);
});

test("failed cue loads report failure once and do not retry on every refresh", async () => {
  for (const response of [
    { ok: false },
    { ok: true, cues: [] },
    new Error("network"),
  ]) {
    const { controller, respond, requests, events } = setup();
    controller.requestTracks();
    respond();
    controller.loadTrack(controller.primaryKey);
    if (response instanceof Error) requests[0].reject(response);
    else requests[0].resolve(response);
    await flush();
    assert.equal(events.filter((event) => event === "failure").length, 1);
    controller.loadTrack(controller.primaryKey);
    assert.equal(requests.length, 1);
  }
});
