import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("PiP closure notifies translation cancellation before awaiting bounds storage", async () => {
  const messages = [];
  let resolveBounds;
  const win = {
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const state = {
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
            return new Promise((resolve) => (resolveBounds = resolve));
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
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const closing = context.PipCompanion.ContentPipLifecycle.closePiP(true);
  assert.equal(state.pipSession.phase, "closed");
  assert.equal(
    messages.some(
      (message) =>
        message.type === "PIP_STATE_CHANGED" && message.pipOpen === false,
    ),
    true,
  );
  assert.equal(win.closed, false);
  resolveBounds({ ok: true });
  await closing;
  assert.equal(win.closed, true);
});
