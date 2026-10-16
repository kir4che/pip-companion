import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/options/shortcut-input.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createApi() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.shortcutInput;
}

const keyEvent = (overrides = {}) => ({
  key: "k",
  code: "KeyK",
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...overrides,
});

test("normalizes keyboard shortcut outcomes and special-key rules", () => {
  const api = createApi();
  const hasMeta = (event) => event.metaKey;
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        api.fromKeyboard(
          keyEvent(),
          "pipPlaybackShortcut",
          "MacIntel",
          hasMeta,
        ),
      ),
    ),
    {
      type: "shortcut",
      shortcut: {
        code: "KeyK",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
      },
    },
  );
  assert.equal(
    api.fromKeyboard(
      keyEvent({ key: "Escape" }),
      "pipPlaybackShortcut",
      "MacIntel",
      hasMeta,
    ).type,
    "cancel",
  );
  assert.equal(
    api.fromKeyboard(
      keyEvent({ key: "Control" }),
      "pipPlaybackShortcut",
      "MacIntel",
      hasMeta,
    ).type,
    "ignore",
  );
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        api.fromKeyboard(
          keyEvent({ key: "Meta" }),
          "pipPlaybackShortcut",
          "MacIntel",
          hasMeta,
        ),
      ),
    ),
    { type: "status", message: "popupModifierKey", parameter: "Command" },
  );
  assert.equal(
    api.fromKeyboard(
      keyEvent({ key: "Meta" }),
      "pipPlaybackShortcut",
      "Win32",
      hasMeta,
    ).message,
    "popupWinKeyUnsupported",
  );
  assert.equal(
    api.fromKeyboard(
      keyEvent({ key: "Tab", ctrlKey: false }),
      "pipPlaybackShortcut",
      "Linux",
      hasMeta,
    ).message,
    "popupNavigationKey",
  );
  assert.equal(
    api.fromKeyboard(
      keyEvent({ key: "Enter", ctrlKey: false }),
      "pipDanmakuInputShortcut",
      "Linux",
      hasMeta,
    ).type,
    "shortcut",
  );
  assert.equal(
    api.fromKeyboard(keyEvent(), "pipResizeShortcut", "Linux", hasMeta).message,
    "popupResizeNeedsModifier",
  );
});

test("normalizes resize-wheel shortcuts and modifier errors", () => {
  const api = createApi();
  const wheelEvent = (overrides = {}) => ({
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    getModifierState: () => false,
    ...overrides,
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.fromWheel(wheelEvent(), "Linux"))),
    {
      type: "shortcut",
      shortcut: {
        code: "Wheel",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
      },
    },
  );
  assert.equal(
    api.fromWheel(wheelEvent({ ctrlKey: false }), "Linux").message,
    "popupResizeNeedsModifier",
  );
  assert.equal(
    api.fromWheel(wheelEvent({ ctrlKey: false, metaKey: true }), "Win32")
      .message,
    "popupWinKeyUnsupported",
  );
});
