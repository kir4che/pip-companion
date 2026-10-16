import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  [
    "../src/shared/danmaku-settings.ts",
    "../src/shared/subtitle-settings.ts",
    "../src/shared/subtitle-style-storage.ts",
    "../src/shared/subtitle-style-store.ts",
  ]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const styleKey = "subtitleStyle";
const layoutKey = "subtitleLayout";

function setup({ stored = {}, getFails = false } = {}) {
  const context = {
    PipCompanion: {
      util: {
        isRecord: (value) =>
          value !== null && typeof value === "object" && !Array.isArray(value),
        getMessage: (key) => key,
      },
    },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(compiled, context);
  const { subtitleSettings, subtitleStyleStorage, subtitleStyleStore } =
    context.PipCompanion;
  const writes = [];
  const statuses = [];
  const store = subtitleStyleStore.create({
    storage: {
      async get(keys) {
        if (getFails) throw new Error("storage unavailable");
        const result = {};
        for (const key of keys) result[key] = stored[key];
        return result;
      },
      async set(values) {
        writes.push(values);
      },
    },
    settings: subtitleSettings,
    t: (key) => key,
    showStatus: (message, error) => statuses.push([message, Boolean(error)]),
    onChange: () => {},
  });
  return {
    store,
    writes,
    statuses,
    settings: subtitleSettings,
    styleStorage: subtitleStyleStorage,
  };
}

test("coalesces rapid style edits into one save and flushes on commit", async () => {
  const { store, writes } = setup();
  store.updateStyle("primary", { fontWeight: 700 });
  store.saveStyle("primary");
  store.updateStyle("primary", { fontWeight: 800 });
  store.saveStyle("primary");
  assert.equal(writes.length, 0);
  await delay(200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][styleKey].fontWeight, 800);

  store.updateStyle("primary", { fontWeight: 900 });
  store.saveStyle("primary", true);
  await delay(10);
  assert.equal(writes.length, 2);
  assert.equal(writes[1][styleKey].fontWeight, 900);
});

test("ignores external storage changes while edits are unsaved", async () => {
  const { store } = setup();
  store.updateStyle("primary", { fontWeight: 700 });
  store.handleStorageChange({ [styleKey]: { newValue: { fontWeight: 100 } } });
  assert.equal(store.styles.primary.fontWeight, 700);

  store.saveStyle("primary", true);
  await delay(10);
  store.handleStorageChange({ [styleKey]: { newValue: { fontWeight: 500 } } });
  assert.equal(store.styles.primary.fontWeight, 500);
});

test("loads styles and writes back scrubbed legacy layout fields", async () => {
  const { store, writes, settings, styleStorage } = setup({
    stored: {
      [styleKey]: {
        fontWeight: 700,
        backgroundColor: "#000000",
        bottomOffset: 20,
      },
    },
  });
  const normalized = styleStorage.normalize(
    {
      fontWeight: 700,
      backgroundColor: "#000000",
      backgroundOpacity: 70,
      bottomOffset: 20,
    },
    settings.DEFAULTS,
  );
  assert.equal(normalized.changed, true);
  assert.equal(normalized.style.fontWeight, 700);
  assert.equal(
    normalized.style.backgroundColor,
    settings.DEFAULTS.backgroundColor,
  );
  assert.equal(
    normalized.style.backgroundOpacity,
    settings.DEFAULTS.backgroundOpacity,
  );
  assert.equal(normalized.style.bottomOffset, settings.DEFAULTS.bottomOffset);

  const unchanged = styleStorage.normalize(
    {
      fontWeight: 700,
      backgroundColor: settings.DEFAULTS.backgroundColor,
      backgroundOpacity: settings.DEFAULTS.backgroundOpacity,
      bottomOffset: settings.DEFAULTS.bottomOffset,
    },
    settings.DEFAULTS,
  );
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.style.fontWeight, 700);

  await store.loadStyles();
  assert.equal(store.styles.primary.fontWeight, 700);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][styleKey].fontWeight, 700);
  assert.equal(
    writes[0][styleKey].backgroundColor,
    settings.DEFAULTS.backgroundColor,
  );
});

test("prefers stored layout and falls back to the legacy style key", async () => {
  const withLayout = setup({
    stored: {
      [layoutKey]: { backgroundOpacity: 40 },
      [styleKey]: { backgroundOpacity: 70 },
    },
  });
  await withLayout.store.loadLayout();
  assert.equal(withLayout.store.layout.backgroundOpacity, 40);

  const legacyOnly = setup({
    stored: { [styleKey]: { backgroundOpacity: 70 } },
  });
  await legacyOnly.store.loadLayout();
  assert.equal(legacyOnly.store.layout.backgroundOpacity, 70);
});

test("guards layout while dirty and debounces its save", async () => {
  const { store, writes } = setup();
  store.updateLayout({ pairGap: 12 });
  store.saveLayout();
  store.handleStorageChange({ [layoutKey]: { newValue: { pairGap: 99 } } });
  assert.equal(store.layout.pairGap, 12);

  await delay(200);
  assert.equal(writes.filter((values) => layoutKey in values).length, 1);
  assert.equal(writes.at(-1)[layoutKey].pairGap, 12);
});

test("falls back to defaults when storage reads fail", async () => {
  const { store, settings } = setup({ getFails: true });
  await store.loadStyles();
  await store.loadLayout();
  assert.equal(store.styles.primary.fontWeight, settings.DEFAULTS.fontWeight);
  assert.equal(
    store.styles.secondary.fontSizeScale,
    settings.SECONDARY_DEFAULTS.fontSizeScale,
  );
  assert.equal(store.layout.pairGap, settings.LAYOUT_DEFAULTS.pairGap);
});
