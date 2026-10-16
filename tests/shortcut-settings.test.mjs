import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/shortcut-settings.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const defaults = {
  launchShortcut: {
    code: "KeyP",
    ctrl: true,
    alt: false,
    shift: false,
    meta: false,
  },
  pipResizeShortcut: {
    code: "Wheel",
    ctrl: true,
    alt: false,
    shift: false,
    meta: false,
  },
};

function getSettings() {
  const context = {
    PipCompanion: {
      util: {
        normalizeShortcut(value, fallback) {
          return {
            code: typeof value?.code === "string" ? value.code : fallback.code,
            ctrl: typeof value?.ctrl === "boolean" ? value.ctrl : fallback.ctrl,
            alt: typeof value?.alt === "boolean" ? value.alt : fallback.alt,
            shift:
              typeof value?.shift === "boolean" ? value.shift : fallback.shift,
            meta: typeof value?.meta === "boolean" ? value.meta : fallback.meta,
          };
        },
      },
    },
  };
  vm.runInNewContext(source, context);
  return context.PipCompanion.shortcutSettings;
}

test("normalizes all shortcut values against their defaults", () => {
  const settings = getSettings();
  const result = settings.normalizeAll(
    { launchShortcut: { code: "KeyL", ctrl: "yes" } },
    ["launchShortcut", "pipResizeShortcut"],
    defaults,
  );
  assert.equal(result.launchShortcut.code, "KeyL");
  assert.equal(result.launchShortcut.ctrl, true);
  assert.equal(result.pipResizeShortcut.code, "Wheel");
});

test("compares shortcut modifiers and code", () => {
  const settings = getSettings();
  assert.equal(
    settings.same(defaults.launchShortcut, { ...defaults.launchShortcut }),
    true,
  );
  assert.equal(
    settings.same(defaults.launchShortcut, {
      ...defaults.launchShortcut,
      alt: true,
    }),
    false,
  );
});
