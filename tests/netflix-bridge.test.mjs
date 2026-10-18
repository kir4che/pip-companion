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
  const english = { trackId: "en", language: "en", displayName: "English" };
  const chinese = { trackId: "zh", language: "zh", displayName: "中文" };
  const japanese = { trackId: "ja", language: "ja", displayName: "日本語" };
  const tracks = [english, chinese, japanese];
  let selected = english;
  const player = {
    seek() {},
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
    addEventListener: (_type, listener) => listeners.push(listener),
    postMessage: (message) => posted.push(message),
    setTimeout,
    clearTimeout,
  };
  const context = {
    window,
    location: { origin: "https://www.netflix.com", pathname: "/watch/1" },
    document: {
      createElement: () => ({
        value: "",
        set innerHTML(value) {
          this.value = value;
        },
      }),
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
  return { posted, send, player, english, chinese, japanese, context };
}

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
