import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup(tracks) {
  const context = { URL, globalThis: { PipCompanion: {} } };
  const source = readFileSync(
    new URL(
      "../src/content/subtitles/providers/standard-text-track.ts",
      import.meta.url,
    ),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  const trackElements = tracks
    .filter((track) => track.source)
    .map((track) => ({
      track,
      src: track.source,
      getAttribute(name) {
        return name === "src" ? this.src : null;
      },
    }));
  return {
    provider: context.globalThis.PipCompanion.standardTextTrack,
    video: {
      textTracks: tracks,
      ownerDocument: { baseURI: "https://example.test/lesson" },
      querySelectorAll: () => trackElements,
    },
  };
}

function track(kind, language, cues = [], label = "", source = "") {
  return {
    kind,
    language,
    label,
    source,
    mode: "disabled",
    cues,
    activeCues: [],
  };
}

test("reads metadata tracks from subtitle and caption paths before cues load", () => {
  const french = track(
    "metadata",
    "fr",
    [{ startTime: 0, endTime: 2, text: "Bonjour" }],
    "",
    "/media/subtitles/fr.vtt",
  );
  const english = track(
    "metadata",
    "en",
    [],
    "",
    "https://media.example/captions/en.vtt",
  );
  const { provider, video } = setup([french, english]);

  assert.deepEqual([...provider.getTracks(video)], [french, english]);
  assert.deepEqual(
    [...provider.getTimedCues(video, french)].map(({ content }) => content),
    ["Bonjour"],
  );
});

test("reads metadata tracks with loaded timed text cues", () => {
  const metadata = track(
    "metadata",
    "de",
    [{ startTime: 0, endTime: 2, text: "Guten Tag" }],
    "",
    "/api/media-track/7",
  );
  const { provider, video } = setup([metadata]);

  assert.deepEqual([...provider.getTracks(video)], [metadata]);
});

test("ignores metadata tracks without a language or subtitle evidence", () => {
  const noLanguage = track("metadata", "", [], "", "/media/subtitles/en.vtt");
  const namedMetadata = track("metadata", "", [], "Telemetry");
  const unrelatedMetadata = track("metadata", "de", [], "", "/events/de");
  const invalidCueMetadata = track(
    "metadata",
    "es",
    [{ startTime: 0, endTime: 0, text: "No timing" }],
    "",
    "/events/es",
  );
  const emptyCueMetadata = track(
    "metadata",
    "it",
    [{ startTime: 0, endTime: 2, text: "   " }],
    "",
    "/events/it",
  );
  const { provider, video } = setup([
    noLanguage,
    namedMetadata,
    unrelatedMetadata,
    invalidCueMetadata,
    emptyCueMetadata,
  ]);

  assert.equal(provider.getTracks(video).length, 0);
});

test("continues to accept standard subtitle and caption tracks", () => {
  const subtitles = track("subtitles", "en");
  const captions = track("captions", "fr");
  const metadata = track("metadata", "");
  const { provider, video } = setup([subtitles, captions, metadata]);

  assert.deepEqual([...provider.getTracks(video)], [subtitles, captions]);
});
