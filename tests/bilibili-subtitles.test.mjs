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
    IS_YOUTUBE: false,
    getComputedStyle: () => ({ position: "absolute", pointerEvents: "none" }),
    document: {
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
    site: { isNetflixHost: () => false, isHahowHost: () => false },
    NativeSecondarySubtitleTrack: {
      create: () => ({ getTrack: () => null, clear() {} }),
    },
    SubtitleTranslation: { create: () => ({ onSubtitlesEnabledChanged() {} }) },
    standardTextTrack: {
      getTracks: () => [],
      getSelectedTrack: () => null,
    },
  });
  const source = readFileSync(
    new URL("../src/content/subtitles.ts", import.meta.url),
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
  };
}

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
