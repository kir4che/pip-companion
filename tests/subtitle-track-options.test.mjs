import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/content/subtitles/track-options.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createApi() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.subtitleTrackOptions;
}

const label = (index) => `Track ${index + 1}`;

const validationSource = ts.transpileModule(
  readFileSync(
    new URL("../src/content/subtitles/track-validation.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createValidationApi() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(validationSource, context);
  return context.PipCompanion.subtitleTrackValidation;
}

test("maps native primary and secondary choices without changing track identity", () => {
  const api = createApi();
  const primary = { label: "", language: "en", mode: "showing" };
  const secondary = { label: "Japanese", language: "ja", mode: "hidden" };
  const ids = new Map([
    [primary, "native:1"],
    [secondary, "native:2"],
  ]);
  const getId = (track) => ids.get(track);
  const tracks = [primary, secondary];

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(api.nativePrimary(tracks, primary, getId, label)),
    ),
    [
      {
        id: "native:1",
        index: 0,
        label: "en",
        language: "en",
        selected: true,
      },
      {
        id: "native:2",
        index: 1,
        label: "Japanese",
        language: "ja",
        selected: false,
      },
    ],
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        api.nativeSecondary(tracks, primary, secondary, getId, label),
      ),
    ),
    [
      {
        id: "native:2",
        index: 1,
        label: "Japanese",
        language: "ja",
        selected: true,
      },
    ],
  );
});

test("maps primary YouTube and Netflix tracks with their indices and selection", () => {
  const api = createApi();
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        api.youtubePrimary(
          [
            {
              key: "en",
              label: "",
              language: "en",
              selected: true,
              canLoadCues: true,
            },
          ],
          label,
        ),
      ),
    ),
    [
      {
        id: "youtube:en",
        index: 0,
        label: "Track 1",
        language: "en",
        selected: true,
      },
    ],
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        api.netflixPrimary(
          [{ key: "zh", index: 2, label: "", language: "zh", selected: false }],
          "zh",
          label,
        ),
      ),
    ),
    [
      {
        id: "netflix:zh",
        index: 2,
        label: "Track 3",
        language: "zh",
        selected: true,
      },
    ],
  );
});

test("filters secondary choices and marks their selected keys", () => {
  const api = createApi();
  const youtube = api.youtubeSecondary(
    [
      {
        key: "primary",
        label: "Primary",
        language: "en",
        selected: true,
        canLoadCues: true,
      },
      {
        key: "unavailable",
        label: "Unavailable",
        language: "fr",
        selected: false,
        canLoadCues: false,
      },
      {
        key: "secondary",
        label: "",
        language: "ja",
        selected: false,
        canLoadCues: true,
      },
    ],
    "secondary",
    label,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(youtube)), [
    {
      id: "youtube:secondary",
      index: 2,
      label: "Track 3",
      language: "ja",
      selected: true,
    },
  ]);

  const netflix = api.netflixSecondary(
    [
      {
        key: "primary",
        index: 0,
        label: "Primary",
        language: "en",
        selected: true,
      },
      {
        key: "secondary",
        index: 3,
        label: "",
        language: "fr",
        selected: false,
      },
    ],
    "primary",
    "secondary",
    label,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(netflix)), [
    {
      id: "netflix:secondary",
      index: 3,
      label: "Track 4",
      language: "fr",
      selected: true,
    },
  ]);
});

test("validates YouTube subtitle track records", () => {
  const validation = createValidationApi();
  assert.equal(
    validation.isYouTubeTrack({
      key: "en",
      label: "English",
      language: "en",
      selected: true,
      canLoadCues: true,
    }),
    true,
  );
  assert.equal(
    validation.isYouTubeTrack({
      key: "en",
      label: "English",
      language: "en",
      selected: true,
      canLoadCues: "yes",
    }),
    false,
  );
});

test("validates Netflix subtitle track records", () => {
  const validation = createValidationApi();
  assert.equal(
    validation.isNetflixTrack({
      key: "track-1",
      index: 0,
      label: "English",
      language: "en",
      selected: false,
    }),
    true,
  );
  assert.equal(
    validation.isNetflixTrack({
      key: "track-1",
      index: -1,
      label: "English",
      language: "en",
      selected: false,
    }),
    false,
  );
});
