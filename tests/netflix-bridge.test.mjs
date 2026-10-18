import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/bridges/netflix.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(fetchImpl) {
  const listeners = [];
  const posted = [];
  const documentListeners = new Map();
  const blobs = [];
  const revokedUrls = [];
  const english = { trackId: "en", language: "en", displayName: "English" };
  const chinese = { trackId: "zh", language: "zh", displayName: "中文" };
  const japanese = { trackId: "ja", language: "ja", displayName: "日本語" };
  const tracks = [english, chinese, japanese];
  let selected = english;
  const player = {
    seek() {},
    getMovieId: () => 1,
    isReady: () => true,
    isPlaying: () => true,
    getTimedTextTrackList: () => tracks,
    getTimedTextTrack: () => selected,
    setTimedTextTrack: (track) => {
      selected = track;
    },
  };
  const root = { videoId: "video-1" };
  Object.defineProperty(root, "timedtexttracks", {
    enumerable: true,
    get: () =>
      tracks.map((track) => ({
        trackId: track.trackId,
        ...(selected === english
          ? {}
          : { urls: [`https://cdn.test/${track.trackId}.vtt`] }),
      })),
  });
  const window = {
    netflix: {
      appContext: {
        state: {
          playerApp: {
            getAPI: () => ({
              videoPlayer: {
                getAllPlayerSessionIds: () => ["session-1"],
                getVideoPlayerBySessionId: () => player,
              },
            }),
            getState: () => ({
              videoPlayer: {
                cadmiumPlayerRepository: { playersById: { "session-1": root } },
              },
            }),
          },
        },
      },
    },
    addEventListener: (type, listener) => {
      if (type === "message") listeners.push(listener);
    },
    postMessage: (message) => posted.push(message),
    setTimeout,
    clearTimeout,
  };
  const context = {
    window,
    location: {
      origin: "https://www.netflix.com",
      pathname: "/watch/1",
      hostname: "www.netflix.com",
    },
    document: {
      documentElement: { dataset: {} },
      addEventListener: (type, listener) => {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(listener);
      },
      dispatchEvent: (event) => {
        for (const listener of documentListeners.get(event.type) ?? [])
          listener(event);
        return true;
      },
      createElement: () => ({
        value: "",
        set innerHTML(value) {
          this.value = value;
        },
      }),
    },
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    Blob,
    URL: {
      createObjectURL: (blob) => {
        blobs.push(blob);
        return `blob:https://www.netflix.com/frame-${blobs.length}`;
      },
      revokeObjectURL: (url) => revokedUrls.push(url),
    },
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, context);
  const send = (data) => {
    for (const listener of listeners)
      listener({ source: window, origin: context.location.origin, data });
  };
  return {
    posted,
    send,
    player,
    english,
    chinese,
    japanese,
    context,
    blobs,
    revokedUrls,
  };
}

function loadStoryboard(bridge) {
  const { context } = bridge;
  context.PipCompanion = {
    site: {
      isYouTubeHost: () => false,
      isBilibiliHost: () => false,
      isGamerHost: () => false,
      isNetflixHost: () => true,
    },
    util: {
      isRecord: (value) =>
        typeof value === "object" && value !== null && !Array.isArray(value),
    },
    ContentPlayback: { isLiveStream: () => false },
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../src/content/pip/storyboard.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    context,
  );
  return context.PipCompanion.ContentStoryboard;
}

function thumbnailRequest(
  bridge,
  seconds,
  path = bridge.context.location.pathname,
) {
  bridge.context.document.dispatchEvent(
    new bridge.context.CustomEvent("pip-companion-request-netflix-storyboard", {
      detail: { seconds, path },
    }),
  );
  const raw =
    bridge.context.document.documentElement.dataset.pipNetflixStoryboardFrame;
  return raw ? JSON.parse(raw) : null;
}

test("Netflix storyboard synchronously returns a JPEG without seeking or changing playback", async () => {
  const bridge = setup();
  bridge.player.seek = () => assert.fail("thumbnail must not seek");
  const bytes = new Uint8Array([0, 255, 216, 255, 217, 0]);
  const requests = [];
  bridge.player.getTrickPlayFrame = (time) => {
    requests.push(time);
    return { image: bytes.subarray(1, 5), time, width: 240, height: 162 };
  };
  const storyboard = loadStoryboard(bridge);
  const video = { duration: 120, currentTime: 12, paused: true };
  const frame = storyboard.getFrame(30, video);
  assert.deepEqual(
    { ...frame },
    {
      url: "blob:https://www.netflix.com/frame-1",
      x: 0,
      y: 0,
      width: 240,
      height: 162,
    },
  );
  assert.deepEqual(requests, [30000]);
  assert.equal(bridge.blobs[0].type, "image/jpeg");
  assert.deepEqual(
    [...new Uint8Array(await bridge.blobs[0].arrayBuffer())],
    [255, 216, 255, 217],
  );
  assert.equal(video.currentTime, 12);
  assert.equal(video.paused, true);
  assert.equal(storyboard.getFrame(30, video).url, frame.url);
  assert.equal(bridge.blobs.length, 1);
  storyboard.reset();
  assert.deepEqual(bridge.revokedUrls, [frame.url]);
  assert.equal(
    bridge.context.document.documentElement.dataset.pipNetflixStoryboardFrame,
    undefined,
  );
});

test("Netflix storyboard bounds cached images and releases them on movie changes", () => {
  const bridge = setup();
  bridge.player.getTrickPlayFrame = (time) => ({
    image: new Uint8Array([255, 216, 255, 217]),
    time,
    width: 240,
    height: 162,
  });
  for (let seconds = 0; seconds < 17; seconds++)
    assert.ok(thumbnailRequest(bridge, seconds));
  assert.deepEqual(bridge.revokedUrls, [
    "blob:https://www.netflix.com/frame-1",
  ]);
  bridge.context.location.pathname = "/watch/2";
  assert.equal(thumbnailRequest(bridge, 10), null);
  bridge.player.getMovieId = () => 2;
  assert.ok(thumbnailRequest(bridge, 10));
  assert.equal(bridge.revokedUrls.length, 17);
  assert.equal(thumbnailRequest(bridge, 10, "/watch/1"), null);
});

test("Netflix storyboard safely falls back when images are unavailable or invalid", () => {
  const bridge = setup();
  const storyboard = loadStoryboard(bridge);
  const video = { duration: 120, currentTime: 0 };
  assert.equal(storyboard.getFrame(10, video), null);
  bridge.player.getTrickPlayFrame = () => {
    throw new Error("not loaded");
  };
  assert.equal(storyboard.getFrame(10, video), null);
  for (const invalid of [
    null,
    { image: new Uint8Array(), time: 0, width: 240, height: 162 },
    { image: new Uint8Array([1]), time: 0, width: NaN, height: 162 },
    { image: new Uint8Array([1]), time: 0, width: 240, height: 4096 },
  ]) {
    bridge.player.getTrickPlayFrame = () => invalid;
    assert.equal(storyboard.getFrame(10, video), null);
  }
  assert.equal(bridge.blobs.length, 0);
  assert.equal(storyboard.getFrame(10, { duration: Infinity }), null);
});

const goodVtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nCaption";

async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

test("Netflix bridge reports load failure separately from successful track restoration", async () => {
  const bridge = setup(async () => ({ ok: false, text: async () => "" }));
  bridge.send({
    type: "PIP_REQUEST_NETFLIX_SUBTITLE_CUES",
    requestId: 1,
    key: "zh",
  });
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(bridge.player.getTimedTextTrack(), bridge.english);
  assert.equal(bridge.posted.at(-1).type, "PIP_NETFLIX_SUBTITLE_CUES");
  assert.equal(bridge.posted.at(-1).requestId, 1);
  assert.equal(bridge.posted.at(-1).loaded, false);
  assert.equal(bridge.posted.at(-1).restored, true);
  assert.deepEqual([...bridge.posted.at(-1).cues], []);
});

test("Netflix bridge treats an unparseable subtitle response as a retryable load failure", async () => {
  const bridge = setup(async () => ({
    ok: true,
    text: async () => "not subtitles",
  }));
  bridge.send({
    type: "PIP_REQUEST_NETFLIX_SUBTITLE_CUES",
    requestId: 1,
    key: "zh",
  });
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(bridge.player.getTimedTextTrack(), bridge.english);
  assert.equal(bridge.posted.at(-1).loaded, false);
  assert.equal(bridge.posted.at(-1).restored, true);
});

test("Netflix bridge restores the original track across rapid secondary requests", async () => {
  const pending = [];
  const bridge = setup(() => new Promise((resolve) => pending.push(resolve)));
  bridge.send({
    type: "PIP_REQUEST_NETFLIX_SUBTITLE_CUES",
    requestId: 1,
    key: "zh",
  });
  await flush();
  assert.equal(bridge.player.getTimedTextTrack(), bridge.chinese);
  assert.equal(pending.length, 1);

  bridge.send({
    type: "PIP_REQUEST_NETFLIX_SUBTITLE_CUES",
    requestId: 2,
    key: "ja",
  });
  pending.shift()({ ok: true, text: async () => goodVtt });
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(bridge.player.getTimedTextTrack(), bridge.japanese);

  pending.shift()({ ok: true, text: async () => goodVtt });
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(bridge.player.getTimedTextTrack(), bridge.english);
  assert.equal(bridge.posted.at(-1).requestId, 2);
  assert.equal(bridge.posted.at(-1).loaded, true);
  assert.equal(bridge.posted.at(-1).restored, true);
  assert.equal(bridge.posted.at(-1).cues[0].content, "Caption");
});
