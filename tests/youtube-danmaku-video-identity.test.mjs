import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/danmaku/youtube.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(videoId, initialVideoId, isLiveContent) {
  const location = {
    hostname: "www.youtube.com",
    href: `https://www.youtube.com/watch?v=${videoId}`,
  };
  const document = {
    scripts: [
      {
        textContent: `ytInitialPlayerResponse = ${JSON.stringify({
          videoDetails: { videoId: initialVideoId, isLiveContent },
        })}`,
      },
    ],
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      setAttribute() {},
      addEventListener() {},
    }),
  };
  const context = {
    location,
    document,
    window: { setTimeout, clearTimeout },
    MutationObserver: class {},
    AbortController,
    Date,
    setInterval,
    clearInterval,
    PipCompanion: {
      site: {
        isYouTubeHost: () => true,
        parseYouTubeVideoId: (href) => new URL(href).searchParams.get("v"),
      },
      runtimeMessages: { addListener() {} },
      util: { getMessage: (key) => key },
      ContentDanmakuSources: { parseYouTubeMessage: () => null },
    },
  };
  vm.runInNewContext(source, context);
  const controller = context.PipCompanion.ContentYouTubeDanmaku.create({
    relay: false,
    lateToleranceSeconds: 0.5,
    restoreWindowSeconds: 0,
    isSettingsLoaded: () => true,
    isVisible: () => true,
    getSourceVideo: () => null,
    getMainRenderer: () => null,
    getPipRenderer: () => null,
    ensureMainRenderer: () => null,
    clear: () => {},
    broadcast: () => {},
  });
  return { context, location, document, controller };
}

test("YouTube live status ignores initial player data from another SPA video", () => {
  const fixture = setup("video-b", "video-a", true);
  assert.equal(fixture.controller.isLive(), false);

  fixture.location.href = "https://www.youtube.com/watch?v=video-a";
  assert.equal(fixture.controller.isLive(), true);
});

test("YouTube live status cache follows the current video identity", () => {
  const fixture = setup("video-a", "video-a", true);
  assert.equal(fixture.controller.isLive(), true);
  fixture.location.href = "https://www.youtube.com/watch?v=video-b";
  fixture.document.scripts[0].textContent = `ytInitialPlayerResponse = ${JSON.stringify(
    {
      videoDetails: { videoId: "video-b", isLiveContent: false },
    },
  )}`;
  assert.equal(fixture.controller.isLive(), false);
});
