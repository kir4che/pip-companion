import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/danmaku/index.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createDanmaku(enabled = true) {
  let requestedKeys = [];
  const storageWrites = [];
  const controller = { checkAndBind() {}, destroy() {}, setSourceVideo() {} };
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
      ContentBilibiliDanmaku: { create: () => controller },
      ContentDanmakuSources: { create: () => controller },
      ContentExtraBilibiliDanmaku: { create: () => controller },
      ContentYouTubeDanmaku: { create: () => controller },
    },
    chrome: {
      storage: {
        onChanged: { addListener() {} },
        local: {
          get(keys, callback) {
            requestedKeys = keys;
            callback({ danmakuEnabled: enabled, danmakuVisible: false });
          },
          set(value) {
            storageWrites.push(value);
          },
        },
      },
    },
    location: { hostname: "www.youtube.com" },
    state: { sourceVideo: null },
    window: { addEventListener() {} },
  };
  vm.runInNewContext(source, context);
  return {
    toggleDanmaku: context.toggleDanmaku,
    requestedKeys,
    storageWrites,
  };
}

test("danmaku visibility defaults on and ignores the old persisted value", () => {
  const { toggleDanmaku, requestedKeys, storageWrites } = createDanmaku();

  assert.equal(toggleDanmaku(), false);
  assert.equal(requestedKeys.includes("danmakuVisible"), false);
  assert.deepEqual(storageWrites, []);
});

test("media reset can restore visibility even when danmaku is disabled", () => {
  const { toggleDanmaku } = createDanmaku(false);

  toggleDanmaku(false);
  assert.equal(toggleDanmaku(true), true);
});
