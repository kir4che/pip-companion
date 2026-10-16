import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const context = { URL };
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(
      new URL("../src/shared/extra-danmaku-url.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  context,
);
const isValidExtraDanmakuSourceUrl =
  context.PipCompanion.isValidExtraDanmakuSourceUrl;

test("accepts supported HTTPS danmaku source URLs", () => {
  for (const url of [
    "https://www.bilibili.com/video/BV1234567890",
    "https://www.bilibili.com/video/av123?p=1000",
    "https://ani.gamer.com.tw/animeVideo.php?sn=123",
    "https://www.twitch.tv/channel_1",
  ])
    assert.equal(isValidExtraDanmakuSourceUrl(url), true, url);
});

test("rejects unsupported protocols, hosts, paths, and invalid identifiers", () => {
  for (const url of [
    "http://www.bilibili.com/video/BV1234567890",
    "https://bilibili.com.example.org/video/BV1234567890",
    "https://www.bilibili.com/video/BV1234567890?p=1001",
    "https://ani.gamer.com.tw/animeVideo.php?sn=0",
    "https://ani.gamer.com.tw/animeVideo.php?sn=1234567890123",
    "https://www.twitch.tv/channel/extra",
  ])
    assert.equal(isValidExtraDanmakuSourceUrl(url), false, url);
});
