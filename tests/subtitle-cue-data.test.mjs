import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/subtitles/cue-data.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createApi() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.subtitleCueData;
}

test("parses common timed cue fields without changing source-specific bounds", () => {
  const api = createApi();
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(api.parseTimedCue({ from: -1, to: 2, content: "x" })),
    ),
    { from: -1, to: 2, content: "x" },
  );
  assert.equal(api.parseTimedCue({ from: 2, to: 2, content: "invalid" }), null);
  assert.equal(api.parseTimedCue({ from: 0, to: 1, content: 2 }), null);
});

test("parses bounded YouTube cue data and rejects malformed cues", () => {
  const api = createApi();
  const cues = api.parseYouTubeCues([
    { from: 0, to: 2, content: "Valid" },
    { from: 2, to: 2, content: "Empty interval" },
    { from: Number.NaN, to: 4, content: "Invalid time" },
    { from: 4, to: 5, content: "x".repeat(10001) },
    null,
  ]);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].content, "Valid");
  assert.equal(api.parseYouTubeCues({}).length, 0);
  assert.equal(
    api.parseYouTubeCues(
      Array.from({ length: 5001 }, (_, from) => ({
        from,
        to: from + 1,
        content: "cue",
      })),
    ).length,
    5000,
  );
});

test("deduplicates equivalent subtitle text by timing", () => {
  const lines = createApi().deduplicateLines([
    { segments: [{ text: "  HELLO\n world " }], from: 1, to: 2 },
    { segments: [{ text: "hello world" }], from: 1, to: 2 },
    { segments: [{ text: "hello world" }], from: 2, to: 3 },
    { segments: [{ text: "same untimed" }] },
    { segments: [{ text: "same untimed" }] },
    { segments: [{ text: "  " }] },
  ]);
  assert.equal(lines.length, 4);
  assert.equal(lines[0].from, 1);
  assert.equal(lines[2].segments[0].text, "same untimed");
});

test("groups rendered subtitle lines in first-seen pair order", () => {
  const grouped = createApi().groupByPairIndex([
    { pairIndex: 2, role: "primary", line: { segments: [{ text: "a" }] } },
    { pairIndex: 1, role: "secondary", line: { segments: [{ text: "b" }] } },
    { pairIndex: 2, role: "secondary", line: { segments: [{ text: "c" }] } },
  ]);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        grouped.map(({ pairIndex, lines }) => ({
          pairIndex,
          texts: lines.map(({ line }) => line.segments[0].text),
        })),
      ),
    ),
    [
      { pairIndex: 2, texts: ["a", "c"] },
      { pairIndex: 1, texts: ["b"] },
    ],
  );
});

test("extracts normalized lines from overlay text", () => {
  const lines = createApi().extractOverlayLines(
    " first  line\n\nsecond\tline ",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(lines)), [
    { segments: [{ text: "first line" }] },
    { segments: [{ text: "second line" }] },
  ]);
});

test("builds a signature from rendered lines and styles", () => {
  const api = createApi();
  const lines = [
    {
      pairIndex: 1,
      role: "primary",
      line: { segments: [{ text: "hello\nworld" }], from: 1, to: 2 },
    },
  ];
  const style = { fontSizeScale: 100 };
  const layout = { pairGap: 35 };
  assert.equal(
    api.getRenderedSignature(lines, style, style, layout),
    JSON.stringify({
      lines: [
        {
          pairIndex: 1,
          role: "primary",
          from: 1,
          to: 2,
          segments: ["hello world"],
        },
      ],
      subtitleStyle: style,
      secondarySubtitleStyle: style,
      subtitleLayout: layout,
    }),
  );
  assert.notEqual(
    api.getRenderedSignature(lines, style, style, layout),
    api.getRenderedSignature(
      lines,
      { ...style, fontSizeScale: 110 },
      style,
      layout,
    ),
  );
});

test("converts active cues to trimmed subtitle lines", () => {
  const lines = createApi().getActiveLines(
    [
      { from: 1, to: 3, content: "  first\nsecond  " },
      { from: 3, to: 4, content: "next" },
      { from: 1, to: 4, content: "  \n " },
    ],
    2,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(lines)), [
    {
      segments: [{ text: "first second" }],
      from: 1,
      to: 3,
    },
  ]);
});
