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

const context = { URL };
vm.createContext(context);
vm.runInContext(transpile("../src/shared/danmaku-blocklist.ts"), context);
const blocklistApi = context.PipCompanion.danmakuBlocklist;

test("normalizes blocklist array and limits to 50 items", () => {
  assert.deepEqual([...blocklistApi.normalize(null)], []);
  assert.deepEqual([...blocklistApi.normalize("test")], []);
  assert.deepEqual(
    [...blocklistApi.normalize(["  幹  ", "劇透", "幹", "", "   "])],
    ["幹", "劇透"],
  );

  const many = Array.from({ length: 60 }, (_, i) => `word${i}`);
  const normalized = blocklistApi.normalize(many);
  assert.equal(normalized.length, 50);
});

test("filters plain keywords regardless of casing and substrings", () => {
  const filter = blocklistApi.createFilter(["幹", "劇透"]);
  assert.equal(filter("幹"), true);
  assert.equal(filter("幹什麼"), true);
  assert.equal(filter("幹嘛"), true);
  assert.equal(filter("骨幹"), true);
  assert.equal(filter("大結局劇透警告"), true);
  assert.equal(filter("你好世界"), false);
  assert.equal(filter(""), false);
  assert.equal(filter(null), false);
  assert.equal(filter(undefined), false);
});

test("supports regex pattern /pattern/flags", () => {
  const filter = blocklistApi.createFilter([
    "/6{3,}/",
    "/^[A-Z]+$/",
    "/spoiler|leak/I", // 支援大寫旗標
    "/(.)\\1{4,}/",
    "/[劇剧]透/",
  ]);
  assert.equal(filter("666"), true);
  assert.equal(filter("66666"), true);
  assert.equal(filter("66"), false);
  assert.equal(filter("HELLO"), true);
  assert.equal(filter("Hello"), false);
  assert.equal(filter("Major Spoiler Alert!"), true);
  assert.equal(filter("New game leaks"), true);
  assert.equal(filter("哈哈哈哈哈"), true);
  assert.equal(filter("loooool"), true);
  assert.equal(filter("哈哈哈哈"), false);
  assert.equal(filter("這個劇透很過分"), true);
  assert.equal(filter("这个剧透很过分"), true);
  assert.equal(filter("這不是透光"), false);
});

test("regex with g or y flags remains stateless and does not alternate between matches", () => {
  // 若帶有 g 旗標，RegExp.test 會前移 lastIndex 造成連續測試時一次 true 一次 false。
  const filter = blocklistApi.createFilter(["/劇透/g", "/^foo/y"]);
  for (let i = 0; i < 5; i++) {
    assert.equal(filter("小心劇透哦"), true);
    assert.equal(filter("foobar"), true);
  }
});

test("filters plain keywords even when spaced with half-width or full-width spaces", () => {
  const filter = blocklistApi.createFilter(["暴雷", "bad apple"]);
  // 正常匹配
  assert.equal(filter("這有暴雷"), true);
  // 中間塞半形空格
  assert.equal(filter("這 有 暴 雷 啦"), true);
  // 中間塞全形空格
  assert.equal(filter("這有暴　雷"), true);
  // 多重空格
  assert.equal(filter("bad   apple"), true);
  assert.equal(filter("無關彈幕"), false);
});

test("gracefully falls back when regex syntax is invalid", () => {
  const filter = blocklistApi.createFilter(["/[abc/"]);
  assert.equal(filter("包含[abc關鍵字"), true);
  assert.equal(filter("包含/[abc/字樣"), true);
  assert.equal(filter("正常文字"), false);
});
