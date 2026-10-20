import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function parser() {
  const context = {
    URL,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    location: {
      href: "https://www.youtube.com/watch?v=aT2ZZCEEwzg",
      hostname: "www.youtube.com",
    },
    PipCompanion: {
      site: {
        isTwitchHost: () => false,
        isBahamutHost: () => false,
        isBilibiliLiveHost: () => false,
      },
      util: {
        parseTime: (value) =>
          value
            .split(":")
            .map(Number)
            .reduce((a, b) => a * 60 + b, 0),
      },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../src/content/danmaku/sources.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    context,
  );
  return context.PipCompanion.ContentDanmakuSources.parseYouTubeMessage;
}

function message() {
  const image = {
    nodeType: 1,
    tagName: "IMG",
    currentSrc: "https://example.com/emoji.png",
    getAttribute: (key) => (key === "alt" ? ":smile:" : null),
  };
  return {
    nodeType: 1,
    tagName: "YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER",
    id: "chat-id",
    dataset: {},
    closest: () => null,
    querySelector: (selector) =>
      ({
        "#message": {
          childNodes: [{ nodeType: 3, textContent: "hello " }, image],
        },
        "#timestamp": { textContent: "1:09:59" },
        "#author-name": { textContent: "author" },
      })[selector] || null,
  };
}

test("parses cross-realm YouTube text and emoji nodes without instanceof checks", () => {
  const parse = parser();
  const data = parse(message());
  assert.equal(data.text, "hello :smile:");
  assert.equal(data.replayTime, 4199);
  assert.equal(data.parts[1].src, "https://example.com/emoji.png");
});

test("parses YouTube timestamps with Unicode direction marks and negative offsets", () => {
  const parse = parser();
  const msg1 = message();
  msg1.querySelector = (selector) =>
    ({
      "#message": { childNodes: [{ nodeType: 3, textContent: "test" }] },
      "#timestamp": { textContent: "\u200e1:05\u200e" },
      "#author-name": { textContent: "author" },
    })[selector] || null;
  const res1 = parse(msg1);
  assert.equal(res1.replayTime, 65);

  const msg2 = message();
  msg2.querySelector = (selector) =>
    ({
      "#message": { childNodes: [{ nodeType: 3, textContent: "test" }] },
      "#timestamp": { textContent: "-0:05" },
      "#author-name": { textContent: "author" },
    })[selector] || null;
  const res2 = parse(msg2);
  assert.equal(res2.replayTime, 0);
});

test("relay parsing neither consumes messages nor depends on local renderer markers", () => {
  const parse = parser(),
    node = message();
  assert(parse(node, false));
  assert.equal(node.dataset.ytDanmakuDone, undefined);
  assert(parse(node));
  assert.equal(parse(node), null);
  assert(parse(node, false));
});
