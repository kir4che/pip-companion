import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("embedded videos use native PiP without moving the player-owned element", async () => {
  const messages = [];
  const handlers = new Map();
  const parent = {};
  const iframeDocument = {
    pictureInPictureElement: null,
    async exitPictureInPicture() {
      this.pictureInPictureElement = null;
      for (const handler of handlers.get("leavepictureinpicture") ?? [])
        handler();
    },
  };
  const video = {
    ownerDocument: iframeDocument,
    parentNode: parent,
    paused: false,
    addEventListener(type, handler) {
      const listeners = handlers.get(type) ?? [];
      listeners.push(handler);
      handlers.set(type, listeners);
    },
    removeEventListener(type, handler) {
      handlers.set(
        type,
        (handlers.get(type) ?? []).filter((listener) => listener !== handler),
      );
    },
    async requestPictureInPicture() {
      iframeDocument.pictureInPictureElement = this;
    },
  };
  const state = {
    pipSession: { phase: "closed" },
    sourceVideo: video,
    videoStash: null,
    subtitlessOn: false,
    get pipWindow() {
      return null;
    },
    get pipUi() {
      return null;
    },
  };
  const context = {
    state,
    document: {},
    window: { clearTimeout() {}, clearInterval() {} },
    chrome: {
      runtime: {
        id: "test-extension",
        sendMessage(message) {
          messages.push(message);
          return Promise.resolve({ ok: false });
        },
      },
    },
    PipCompanion: {
      util: { getMessage: (key) => key },
      ContentPlayback: { cancelNextVideoRequest() {} },
      ContentVideo: {
        getDocumentPip() {
          assert.fail("embedded videos must not open a document PiP window");
        },
      },
    },
  };
  const source = readFileSync(
    new URL("../src/content/pip/lifecycle.ts", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  const lifecycle = context.PipCompanion.ContentPipLifecycle;
  assert.equal((await lifecycle.openPiP()).ok, true);
  assert.equal(iframeDocument.pictureInPictureElement, video);
  assert.equal(video.parentNode, parent);
  assert.equal(lifecycle.isPipOpen(), true);
  assert.equal(
    messages.some(
      (message) => message.type === "PIP_STATE_CHANGED" && message.pipOpen,
    ),
    true,
  );

  await lifecycle.closePiP(true);
  assert.equal(iframeDocument.pictureInPictureElement, null);
  assert.equal(video.parentNode, parent);
  assert.equal(lifecycle.isPipOpen(), false);
  assert.equal(
    messages.some(
      (message) => message.type === "PIP_STATE_CHANGED" && !message.pipOpen,
    ),
    true,
  );

  let resolvePiPRequest;
  video.requestPictureInPicture = () =>
    new Promise((resolve) => {
      resolvePiPRequest = () => {
        iframeDocument.pictureInPictureElement = video;
        resolve();
      };
    });

  const opening = lifecycle.openPiP();
  const closing = lifecycle.closePiP(true);
  resolvePiPRequest();
  await Promise.all([opening, closing]);

  assert.equal(iframeDocument.pictureInPictureElement, null);
  assert.equal(lifecycle.isPipOpen(), false);
});
