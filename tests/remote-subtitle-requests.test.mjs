import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/subtitles/remote-requests.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const cue = { from: 1, to: 2, content: "Caption" };

function setup(options = { isYouTube: true, isNetflix: true }) {
  let now = 10000;
  const posted = [];
  const clearedTimers = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    Date: { now: () => now },
    location: { origin: "https://www.netflix.com" },
    window: {
      postMessage: (msg, origin) => posted.push({ ...msg, origin }),
      setTimeout: (callback, delay) => {
        const id = ++nextTimer;
        timers.set(id, { callback, due: now + delay });
        return id;
      },
      clearTimeout: (id) => {
        clearedTimers.push(id);
        timers.delete(id);
      },
    },
  };
  vm.runInNewContext(source, context);
  return {
    remote: context.PipCompanion.subtitleRemoteRequests.create(options),
    posted,
    clearedTimers,
    advance: (milliseconds) => {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.due > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    timers,
  };
}

for (const [channel, request, type, origin] of [
  [
    "youtubePrimary",
    "requestYouTubePrimaryCues",
    "PIP_REQUEST_YT_SUBTITLE_CUES",
    "*",
  ],
  [
    "youtubeSecondary",
    "requestYouTubeSecondaryCues",
    "PIP_REQUEST_YT_SUBTITLE_CUES",
    "*",
  ],
  [
    "netflixSecondary",
    "requestNetflixSecondaryCues",
    "PIP_REQUEST_NETFLIX_SUBTITLE_CUES",
    "https://www.netflix.com",
  ],
]) {
  function select(remote, key) {
    if (channel === "youtubePrimary") {
      remote.state.youtubeTracks = [{ key, selected: true, canLoadCues: true }];
      remote.updateYouTubePrimaryTrackKey();
    } else remote[channel].reset(key, channel !== "youtubeSecondary");
  }

  test(`${channel}: deduplicates pending and loaded cues and preserves message routing`, () => {
    const { remote, posted, advance } = setup();
    const controller = remote[channel];
    remote[request]();
    assert.equal(posted.length, 0);
    select(remote, "en");
    remote[request]();
    remote[request]();
    advance(2999);
    remote[request]();
    assert.equal(posted.length, 1);
    assert.equal(controller.pendingTrack, "en");
    assert.equal(controller.loadedTrack, "");
    assert.equal(posted[0].type, type);
    assert.equal(posted[0].origin, origin);
    assert.equal(posted[0].key, "en");
    assert.equal(controller.matches(posted[0].requestId, "en"), true);
    assert.equal(controller.matches(String(posted[0].requestId), "en"), false);
    assert.equal(controller.matches(posted[0].requestId, "zh"), false);
    controller.complete([cue]);
    assert.equal(controller.pendingTrack, "");
    assert.equal(controller.loadedTrack, "en");
    assert.equal(controller.cues[0], cue);
    remote[request]();
    assert.equal(posted.length, 1);
  });

  test(`${channel}: failed and empty loads retry at the throttle boundary`, () => {
    for (const cues of [null, []]) {
      const { remote, posted, advance } = setup();
      select(remote, "en");
      remote[request]();
      remote[channel].complete(cues);
      assert.equal(remote[channel].loadedTrack, "");
      advance(2999);
      remote[request]();
      assert.equal(posted.length, 1);
      advance(1);
      remote[request]();
      assert.equal(posted.length, 2);
      assert.ok(posted[1].requestId > posted[0].requestId);
      assert.equal(remote[channel].matches(posted[0].requestId, "en"), false);
    }
  });

  test(`${channel}: track switches and reset invalidate previous responses`, () => {
    const { remote, posted, advance } = setup();
    const controller = remote[channel];
    select(remote, "en");
    remote[request]();
    const original = posted[0];
    select(remote, "zh");
    assert.equal(controller.pendingTrack, "");
    assert.equal(controller.cues, null);
    assert.equal(controller.matches(original.requestId, original.key), false);
    remote[request]();
    // YouTube 第二字幕軌切換後會保留節流時間，其他字幕請求則會重設。
    assert.equal(posted.length, channel === "youtubeSecondary" ? 1 : 2);
    advance(3000);
    remote[request]();
    assert.equal(posted.at(-1).key, "zh");
    const previous = posted.at(-1);
    remote.reset();
    assert.equal(controller.trackKey, "");
    assert.equal(controller.pendingTrack, "");
    assert.equal(controller.loadedTrack, "");
    assert.equal(controller.cues, null);
    assert.equal(controller.matches(previous.requestId, previous.key), false);
    select(remote, "zh");
    remote[request]();
    assert.equal(posted.length, 3);
    assert.ok(posted.at(-1).requestId > previous.requestId);
  });
}

test("primary YouTube selection preserves in-flight requests until the selected key changes", () => {
  const { remote, posted } = setup();
  remote.state.youtubeTracks = [
    { key: "en", selected: true, canLoadCues: false },
  ];
  remote.requestYouTubePrimaryCues();
  assert.equal(remote.youtubePrimary.trackKey, "en");
  assert.equal(posted.length, 0);
  remote.state.youtubeTracks[0].canLoadCues = true;
  remote.requestYouTubePrimaryCues();
  remote.updateYouTubePrimaryTrackKey();
  assert.equal(remote.youtubePrimary.matches(posted[0].requestId, "en"), true);
  remote.state.youtubeTracks = [];
  remote.updateYouTubePrimaryTrackKey();
  assert.equal(remote.youtubePrimary.trackKey, "");
  assert.equal(remote.youtubePrimary.matches(posted[0].requestId, "en"), false);
});

test("inactive platforms do not post cue or track requests", () => {
  const { remote, posted } = setup({ isYouTube: false, isNetflix: false });
  remote.state.youtubeTracks = [
    { key: "en", selected: true, canLoadCues: true },
  ];
  remote.youtubeSecondary.reset("zh");
  remote.netflixSecondary.reset("zh");
  remote.requestYouTubePrimaryCues();
  remote.requestYouTubeSecondaryCues();
  remote.requestNetflixSecondaryCues();
  remote.requestYouTubeTracks();
  remote.requestNetflixTracks(true);
  assert.equal(posted.length, 0);
});

test("Netflix retries clear loading state and successful empty responses remain cached", () => {
  const { remote, posted } = setup();
  remote.netflixSecondary.reset("zh");
  assert.equal(remote.isNetflixSecondaryActive(), false);
  remote.requestNetflixSecondaryCues();
  assert.equal(remote.isNetflixSecondaryActive(), true);
  remote.netflixSecondary.retry();
  assert.equal(remote.netflixSecondary.pendingTrack, "");
  assert.equal(remote.isNetflixSecondaryActive(), false);
  remote.requestNetflixSecondaryCues();
  assert.equal(posted.length, 2);
  remote.netflixSecondary.complete([], true);
  remote.requestNetflixSecondaryCues();
  assert.equal(posted.length, 2);
  assert.equal(remote.netflixSecondary.loadedTrack, "zh");
  remote.state.netflixTracks = [{ key: "zh", selected: true }];
  assert.equal(remote.isNetflixSecondaryActive(), true);
  remote.state.netflixTracks = [];
  remote.state.netflixSecondaryCueRetryTimer = 42;
  remote.state.netflixSecondaryCueRetryCount = 2;
  assert.equal(remote.isNetflixSecondaryActive(), true);
  remote.reset();
  assert.deepEqual(remote.state.netflixTracks.length, 0);
  assert.equal(remote.state.netflixSecondaryCueRetryTimer, null);
  assert.equal(remote.state.netflixSecondaryCueRetryCount, 0);
});

test("track discovery retains throttling, forced Netflix refresh and reset behavior", () => {
  const { remote, posted, advance, clearedTimers } = setup();
  remote.requestYouTubeTracks();
  remote.requestNetflixTracks();
  remote.requestYouTubeTracks();
  remote.requestNetflixTracks();
  assert.equal(posted.length, 2);
  advance(1999);
  remote.requestYouTubeTracks();
  remote.requestNetflixTracks();
  assert.equal(posted.length, 2);
  advance(1);
  remote.requestYouTubeTracks();
  remote.requestNetflixTracks();
  assert.equal(posted.length, 4);
  remote.requestNetflixTracks(true);
  assert.equal(posted.length, 5);
  const oldRequestId = posted.at(-1).requestId;
  remote.state.netflixSecondaryCueRetryTimer = 42;
  remote.reset();
  assert.ok(clearedTimers.includes(42));
  assert.ok(remote.state.netflixTrackRequestId > oldRequestId);
  remote.requestYouTubeTracks();
  remote.requestNetflixTracks();
  assert.equal(posted.length, 7);
});

test("cue requests time out, become retryable, and reject late responses", () => {
  const { remote, posted, advance } = setup();
  remote.netflixSecondary.reset("en");
  remote.requestNetflixSecondaryCues();
  const original = posted.at(-1);
  assert.equal(remote.netflixSecondary.pendingTrack, "en");

  advance(4999);
  assert.equal(remote.netflixSecondary.pendingTrack, "en");
  advance(1);
  assert.equal(remote.netflixSecondary.pendingTrack, "");
  assert.equal(
    remote.netflixSecondary.matches(original.requestId, "en"),
    false,
  );

  remote.requestNetflixSecondaryCues();
  const retry = posted.at(-1);
  assert.ok(retry.requestId > original.requestId);
  remote.netflixSecondary.complete([cue]);
  assert.equal(remote.netflixSecondary.loadedTrack, "en");
  assert.equal(
    remote.netflixSecondary.matches(original.requestId, "en"),
    false,
  );
});
