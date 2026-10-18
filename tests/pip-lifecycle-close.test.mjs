import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function createLifecycle(video = null, pauseOnPipClose = true) {
  const messages = [];
  const boundsResolvers = [];
  const win = {
    closed: false,
    innerWidth: 640,
    outerWidth: 640,
    outerHeight: 360,
    screenX: 20,
    screenY: 30,
    close() {
      this.closed = true;
    },
  };
  const state = {
    sourceVideo: video,
    pauseOnPipClose,
    pipSession: {
      phase: "active",
      window: win,
      ui: { video: {}, dispose() {} },
    },
    get pipUi() {
      return this.pipSession.ui ?? null;
    },
  };
  const context = {
    state,
    window: { clearTimeout() {}, clearInterval() {} },
    destroyDanmakuInPip() {},
    chrome: {
      runtime: {
        id: "test-extension",
        sendMessage(message) {
          messages.push(message);
          if (message.type === "SAVE_PIP_BOUNDS")
            return new Promise((resolve) => boundsResolvers.push(resolve));
          return Promise.resolve({ ok: false });
        },
      },
    },
    PipCompanion: {
      util: { getMessage: (key) => key },
      ContentPlayback: { cancelNextVideoRequest() {} },
      ContentSubtitles: { restoreNativeSubtitleModes() {} },
      ContentStoryboard: { reset() {} },
      PipAudio: { stop() {} },
    },
  };
  const source = readFileSync(
    new URL("../src/content/pip/lifecycle.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(
      source.replace(
        "  return {\n    bindSourceVideo,",
        "  globalThis.flushBounds = flushPipBounds;\n  return {\n    bindSourceVideo,",
      ),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    context,
  );
  return { context, state, win, messages, boundsResolvers };
}

test("PiP closure notifies cancellation and closes before bounds storage completes", async () => {
  const { context, state, win, messages, boundsResolvers } = createLifecycle();
  const closing = context.PipCompanion.ContentPipLifecycle.closePiP(true);
  assert.equal(state.pipSession.phase, "closed");
  assert.equal(
    messages.some(
      (message) =>
        message.type === "PIP_STATE_CHANGED" && message.pipOpen === false,
    ),
    true,
  );
  assert.equal(win.closed, true);
  boundsResolvers[0]({ ok: true });
  await closing;
  assert.equal(win.closed, true);
});

for (const closeWindow of [true, false]) {
  for (const pauseOnPipClose of [true, false]) {
    test(`closing document PiP respects pause=${pauseOnPipClose} (closeWindow=${closeWindow})`, async () => {
      const video = {
        paused: false,
        pause() {
          this.paused = true;
        },
      };
      const { context, state, win, boundsResolvers } = createLifecycle(
        video,
        pauseOnPipClose,
      );
      if (!closeWindow) win.closed = true;
      const closing =
        context.PipCompanion.ContentPipLifecycle.closePiP(closeWindow);
      assert.equal(video.paused, pauseOnPipClose);
      assert.equal(state.pipSession.phase, "closed");
      boundsResolvers[0]?.({ ok: true });
      await closing;
    });
  }
}

test("a repeated close does not pause playback resumed on the original page", async () => {
  const video = {
    pause() {
      assert.fail("closed PiP must not pause the page video");
    },
  };
  const { context, state } = createLifecycle(video);
  state.pipSession = { phase: "closed" };
  await context.PipCompanion.ContentPipLifecycle.closePiP(true);
});

test("PiP closure sends final bounds while an earlier save is still pending", async () => {
  const { context, win, messages, boundsResolvers } = createLifecycle();
  const previousSave = context.flushBounds(true, win);
  win.outerWidth = 960;
  win.outerHeight = 540;
  win.screenX = 80;
  const closing = context.PipCompanion.ContentPipLifecycle.closePiP(true);
  assert.equal(win.closed, true);
  const saves = messages.filter(
    (message) => message.type === "SAVE_PIP_BOUNDS",
  );
  assert.equal(saves.length, 2);
  assert.equal(saves[0].width, 640);
  assert.equal(saves[1].width, 960);
  assert.equal(saves[1].height, 540);
  assert.equal(saves[1].left, 80);
  boundsResolvers[0]({ ok: true });
  await previousSave;
  boundsResolvers[1]({ ok: true });
  await closing;
});
