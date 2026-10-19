import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function transpile(file) {
  return ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
}

const context = { navigator: { platform: "MacIntel" }, URL };
vm.createContext(context);
vm.runInContext(transpile("../src/shared/utils.ts"), context);
vm.runInContext(transpile("../src/shared/danmaku-jump.ts"), context);
const { parseJumpSeconds } = context.PipCompanion.danmakuJump;

test("parses 空降 timestamps into seconds", () => {
  assert.equal(parseJumpSeconds("空降03:10"), 190);
  assert.equal(parseJumpSeconds("空降 3:10"), 190);
  assert.equal(parseJumpSeconds("空降到03:10"), 190);
  assert.equal(parseJumpSeconds("空降至 3:10"), 190);
  assert.equal(parseJumpSeconds("空降：03:10"), 190, "關鍵字後全形冒號");
  assert.equal(parseJumpSeconds("空降03：10"), 190, "全形冒號");
  assert.equal(parseJumpSeconds("神作，空降 1:02:03 謝謝"), 3723);
});

test("parses 跳傘 (traditional and simplified) into seconds", () => {
  assert.equal(parseJumpSeconds("跳傘03:10"), 190);
  assert.equal(parseJumpSeconds("跳伞03:10"), 190, "簡體");
  assert.equal(parseJumpSeconds("跳傘到 3:10"), 190);
  assert.equal(parseJumpSeconds("跳伞03：10"), 190, "簡體＋全形冒號");
  assert.equal(parseJumpSeconds("高能跳傘1:02:03"), 3723);
});

test("ignores 空降 danmaku without a valid timestamp", () => {
  assert.equal(parseJumpSeconds("空降成功"), null);
  assert.equal(parseJumpSeconds("空降"), null);
  assert.equal(parseJumpSeconds("跳傘成功"), null);
  assert.equal(parseJumpSeconds("跳伞沒有時間"), null);
  assert.equal(parseJumpSeconds("空降99:99"), null);
  assert.equal(parseJumpSeconds("空降03:1"), null);
  assert.equal(parseJumpSeconds("空降兵03:10 出擊"), 190, "帶額外文字仍吃時間");
  assert.equal(parseJumpSeconds("這裡沒有時間"), null);
  assert.equal(parseJumpSeconds("03:10 開始"), null, "無關鍵字的時間戳");
  assert.equal(parseJumpSeconds("跳到03:10"), null, "跳字不算關鍵字");
  assert.equal(parseJumpSeconds(""), null);
  assert.equal(parseJumpSeconds(null), null);
});
