import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/pip/playback.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createPlayback() {
  const feedback = [];
  let enabled = true;
  let visible = true;
  const context = {
    PipCompanion: {
      util: { getMessage: (key) => key },
      ContentPlaylist: { getPlaylist() {}, selectPlaylistItem() {} },
      ContentFeedback: { showFeedback: (msg) => feedback.push(msg) },
    },
    isDanmakuEnabled: () => enabled,
    toggleDanmaku: () => {
      visible = !visible;
      return visible;
    },
  };
  vm.runInNewContext(source, context);
  return {
    playback: context.PipCompanion.ContentPlayback,
    feedback,
    setEnabled(value) {
      enabled = value;
    },
  };
}

test("danmaku shortcut reports the resulting visibility state", () => {
  const { playback, feedback } = createPlayback();

  playback.toggleDanmakuFromShortcut();
  playback.toggleDanmakuFromShortcut();

  assert.deepEqual(feedback, ["pipDanmakuOff", "pipDanmakuOn"]);
});

test("danmaku shortcut does not report a toggle when danmaku is disabled", () => {
  const { playback, feedback, setEnabled } = createPlayback();
  setEnabled(false);

  playback.toggleDanmakuFromShortcut();

  assert.deepEqual(feedback, []);
});
