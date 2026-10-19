import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function transpile(file) {
  return ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
}

const sources = [
  "../src/shared/utils.ts",
  "../src/shared/danmaku-jump.ts",
  "../src/content/danmaku/index.ts",
];

function createJump({
  danmakuEnabled = true,
  jumpEnabled = true,
  currentTime = 10,
  duration = 1200,
} = {}) {
  const controller = { checkAndBind() {}, destroy() {}, setSourceVideo() {} };
  const video = { currentTime, duration };
  // 鎖住各彈幕管線的 broadcast 接線，都必須接到會觸發跳轉的 broadcastDanmaku。
  const pipelineDeps = {};
  const capture = (name) => (deps) => {
    pipelineDeps[name] = deps;
    return controller;
  };
  const context = {
    PipCompanion: {
      danmakuSettings: { STORAGE_KEY: "danmakuStyle", normalize: () => ({}) },
      site: {
        isYouTubeHost: () => true,
        isBilibiliHost: () => false,
        isBilibiliLiveHost: () => false,
        isTwitchHost: () => false,
        isBahamutHost: () => false,
      },
      ContentBilibiliDanmaku: { create: capture("bilibili") },
      ContentDanmakuSources: { create: capture("sources") },
      ContentExtraBilibiliDanmaku: { create: capture("extra") },
      ContentYouTubeDanmaku: { create: capture("youtube") },
    },
    chrome: {
      storage: {
        onChanged: { addListener() {} },
        local: {
          get(keys, callback) {
            callback({ danmakuEnabled });
          },
          set() {},
        },
      },
    },
    location: { hostname: "www.youtube.com" },
    navigator: { platform: "MacIntel" },
    state: {
      sourceVideo: video,
      danmakuJumpEnabled: jumpEnabled,
    },
    window: { addEventListener() {} },
  };
  vm.createContext(context);
  for (const file of sources) vm.runInContext(transpile(file), context);
  return {
    context,
    video,
    jump: context.PipCompanion.ContentDanmakuJump,
    pipelineDeps,
  };
}

// 所有彈幕管線都要匯流到 broadcastDanmaku → renderer.emit → ContentDanmakuJump.handle，否則額外彈幕／站內彈幕會漏掉空降偵測。bilibili 不吃 broadcast 依賴，改走 renderer.emit 支線。
test("site, YouTube and extra danmaku broadcast through the jump pipeline", () => {
  const { context, pipelineDeps } = createJump();
  for (const name of ["sources", "youtube", "extra"]) {
    assert.equal(
      pipelineDeps[name]?.broadcast,
      context.broadcastDanmaku,
      `${name} 管線的 broadcast 應接到 broadcastDanmaku（會觸發空降跳轉）`,
    );
  }
  assert.equal(
    typeof pipelineDeps.bilibili?.getRenderer,
    "function",
    "bilibili 管線走 renderer.emit（emit 內會觸發空降跳轉）",
  );
});

test("seeks the video to the 空降 target when the feature is on", () => {
  const { jump, video } = createJump();
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 190);
});

test("stays put when the jump toggle is off", () => {
  const { jump, video } = createJump({ jumpEnabled: false });
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 10);
});

test("stays put when danmaku is disabled", () => {
  const { jump, video } = createJump({ danmakuEnabled: false });
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 10);
});

test("stays put when danmaku is hidden after being toggled off", () => {
  const { context, jump, video } = createJump();
  assert.equal(context.toggleDanmaku(false), false); // 關閉顯示
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 10);
});

test("ignores danmaku without a jump target", () => {
  const { jump, video } = createJump();
  jump.handle({ text: "空降成功" });
  jump.handle(null);
  assert.equal(video.currentTime, 10);
});

test("ignores a target already within one second of the current time", () => {
  const { jump, video } = createJump({ currentTime: 189.5 });
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 189.5);
});

test("auto jump never moves backwards", () => {
  const { jump, video } = createJump({ currentTime: 600 });
  jump.handle({ text: "空降00:30" });
  assert.equal(video.currentTime, 600, "已經播到後面的目標不往回跳");
});

test("ignores a second jump inside the cooldown window", () => {
  const { jump, video } = createJump();
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 190);
  jump.handle({ text: "空降10:00" });
  assert.equal(video.currentTime, 190, "2 秒冷卻內的第二則不跳");
});

test("ignores targets at or beyond the end of the video", () => {
  const { jump, video } = createJump({ duration: 190 });
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 10);
});

test("ignores live streams whose duration is not finite", () => {
  const { jump, video } = createJump({ duration: Infinity });
  jump.handle({ text: "空降03:10" });
  assert.equal(video.currentTime, 10);
});

test("stays put when no source video is bound", () => {
  const { context, jump } = createJump();
  context.state.sourceVideo = null;
  jump.handle({ text: "空降03:10" });
  assert.equal(context.state.sourceVideo, null);
});

test("manual seek jumps directly without the auto-jump gates", () => {
  const { jump, video } = createJump({ jumpEnabled: false });
  jump.seek(190);
  assert.equal(video.currentTime, 190, "手動點擊不受自動跳轉開關限制");
});

test("manual seek blocks the auto jump right after it", () => {
  const { jump, video } = createJump();
  jump.seek(190);
  jump.handle({ text: "空降10:00" });
  assert.equal(video.currentTime, 190, "點擊後冷卻內的自動跳轉不觸發");
});

test("manual seek ignores targets at or beyond the end of the video", () => {
  const { jump, video } = createJump({ duration: 190 });
  jump.seek(190);
  assert.equal(video.currentTime, 10);
});

test("manual seek ignores live streams and missing videos", () => {
  const { context, jump, video } = createJump({ duration: Infinity });
  jump.seek(190);
  assert.equal(video.currentTime, 10, "直播不跳");
  context.state.sourceVideo = null;
  jump.seek(190);
  assert.equal(context.state.sourceVideo, null, "無影片不丟例外");
});
