import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function createBackground() {
  const handlers = [];
  const stored = { pipTabId: 7, pipSourcePlaying: true };
  let releaseSave;
  let delaySave = true;
  const context = {
    exports: {},
    console,
    PipCompanion: {},
    require(path) {
      if (path.includes("message-dispatcher"))
        return {
          runtimeMessageDispatcher: {
            addListener(types, handler) {
              handlers.push({ types, handler });
            },
          },
        };
      if (path.includes("type-guards"))
        return {
          isRecord: (value) => value !== null && typeof value === "object",
        };
      return new Proxy({}, { get: () => () => {} });
    },
    chrome: {
      runtime: {
        onInstalled: { addListener() {} },
        sendMessage: async () => ({}),
      },
      tabs: {
        onRemoved: { addListener() {} },
        sendMessage: async () => ({ pipOpen: false }),
        query: async () => [],
      },
      windows: {
        onRemoved: { addListener() {} },
        get() {
          assert.fail("saving a snapshot must not query a closed window");
        },
      },
      storage: {
        session: {
          async get() {
            return { ...stored };
          },
          async set(values) {
            if (values.pipBounds && delaySave) {
              delaySave = false;
              await new Promise((resolve) => {
                releaseSave = resolve;
              });
            }
            Object.assign(stored, values);
          },
          async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys])
              delete stored[key];
          },
        },
      },
    },
  };
  const source = readFileSync(
    new URL("../src/background/index.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    context,
  );
  return {
    stored,
    releaseSave: () => releaseSave(),
    dispatch(msg, tabId = 7) {
      const registration = handlers.find(({ types }) =>
        types.includes(msg.type),
      );
      return new Promise((resolve) => {
        const asynchronous = registration.handler(
          msg,
          { tab: { id: tabId, windowId: 2 } },
          resolve,
        );
        if (!asynchronous) resolve();
      });
    },
  };
}

test("final bounds save survives window closure and precedes ownership cleanup", async () => {
  const background = createBackground();
  const bounds = {
    type: "SAVE_PIP_BOUNDS",
    innerWidth: 640,
    left: 20,
    top: 30,
    width: 640,
    height: 360,
  };
  const first = background.dispatch(bounds);
  await new Promise((resolve) => setImmediate(resolve));
  const final = background.dispatch({
    ...bounds,
    left: 80,
    width: 960,
    height: 540,
  });
  await background.dispatch({ type: "PIP_STATE_CHANGED", pipOpen: false });
  assert.equal(background.stored.pipTabId, 7);
  background.releaseSave();
  assert.equal((await first).ok, true);
  assert.equal((await final).ok, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(background.stored.pipTabId, null);
  assert.deepEqual(
    { ...background.stored.pipBounds },
    { left: 80, top: 30, width: 960, height: 540 },
  );
});

test("bounds snapshots still reject a non-owner tab and invalid dimensions", async () => {
  const background = createBackground();
  const bounds = {
    type: "SAVE_PIP_BOUNDS",
    innerWidth: 640,
    left: 0,
    top: 0,
    width: 640,
    height: 360,
  };
  assert.equal((await background.dispatch(bounds, 8)).ok, false);
  assert.equal((await background.dispatch({ ...bounds, width: 0 })).ok, false);
  assert.equal(background.stored.pipBounds, undefined);
});
