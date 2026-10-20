import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup({ deferFirstStart = false, autoOpen = false } = {}) {
  let handler, removed, updated, releaseStart;
  const startGate = new Promise((resolve) => {
    releaseStart = resolve;
  });
  const sent = [];
  const createdTabs = [];
  const removedTabs = [];
  let probeFailures = 0;
  const sourceProbe = {
    videoId: "aT2ZZCEEwzg",
    url: "https://www.youtube.com/watch?v=aT2ZZCEEwzg",
  };
  const context = {
    exports: {},
    URL,
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    require: (path) =>
      path.includes("message-dispatcher")
        ? {
            runtimeMessageDispatcher: {
              addListener(_types, listener) {
                handler = listener;
              },
            },
          }
        : {
            isRecord: (v) =>
              v !== null && typeof v === "object" && !Array.isArray(v),
          },
    chrome: {
      tabs: {
        query: async () =>
          (autoOpen
            ? [{ id: 1 }, { id: 3 }]
            : [{ id: 1 }, { id: 2 }, { id: 3 }]
          ).concat(createdTabs.map((tab) => ({ id: tab.id }))),
        create: async ({ url, active }) => {
          const tab = { id: 9, url, active };
          createdTabs.push(tab);
          return tab;
        },
        remove: async (tabId) => {
          removedTabs.push(tabId);
        },
        get: async (tabId) => {
          const ids = [1, 2, 3].concat(createdTabs.map((tab) => tab.id));
          if (!ids.includes(tabId)) throw new Error("No tab with id");
          return { id: tabId };
        },
        sendMessage: async (tabId, msg) => {
          sent.push({ tabId, ...msg });
          if (msg.type === "YOUTUBE_CHAT_PROBE") {
            if (probeFailures > 0) {
              probeFailures--;
              return null;
            }
            return tabId === 2 || (autoOpen && tabId === 9)
              ? sourceProbe
              : null;
          }
          if (msg.type === "YOUTUBE_CHAT_START" && deferFirstStart) {
            deferFirstStart = false;
            await startGate;
          }
          return { ok: true, mode: "replay" };
        },
        onRemoved: {
          addListener(fn) {
            removed = fn;
          },
        },
        onUpdated: {
          addListener(fn) {
            updated = fn;
          },
        },
      },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../src/background/youtube-chat.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    context,
  );
  context.exports.registerYouTubeChatListener();
  const sender = (id, url = "https://www.youtube.com/watch?v=aT2ZZCEEwzg") => ({
    tab: { id, url },
    url,
    frameId: 0,
  });
  const dispatch = async (
    msg,
    from = sender(1, "https://www.twitch.tv/channel"),
  ) => {
    let response;
    await handler(msg, from, (value) => {
      response = value;
    });
    return response;
  };
  return {
    dispatch,
    sent,
    sender,
    releaseStart,
    createdTabs,
    removedTabs,
    failProbes: (count) => {
      probeFailures = count;
    },
    removed: (...args) => removed(...args),
    updated: (...args) => updated(...args),
  };
}
const start = {
  type: "START_EXTRA_YOUTUBE_CHAT",
  videoId: "aT2ZZCEEwzg",
  connectionId: "session-one",
};
const clock = {
  type: "EXTRA_YOUTUBE_CHAT_CLOCK",
  connectionId: "session-one",
  time: 4197,
  paused: true,
  ended: false,
  seekRevision: 1,
};
const data = { text: "hello", messageId: "message-one", replayTime: 4199 };

test("relays only the selected source and current seek generation", async () => {
  const s = setup();
  assert.equal((await s.dispatch(start)).ok, true);
  await s.dispatch(clock);
  const message = {
    type: "YOUTUBE_CHAT_MESSAGE",
    connectionId: start.connectionId,
    seekRevision: 1,
    data,
  };
  await s.dispatch(message, s.sender(3));
  await s.dispatch({ ...message, seekRevision: 0 }, s.sender(2));
  await s.dispatch(message, { ...s.sender(2), frameId: 1 });
  await s.dispatch(
    message,
    s.sender(2, "https://www.youtube.com/watch?v=BM4fWBscpVU"),
  );
  assert.equal(
    s.sent.filter((m) => m.type === "EXTRA_YOUTUBE_CHAT_MESSAGE").length,
    0,
  );
  await s.dispatch(message, s.sender(2));
  assert.equal(
    s.sent.filter((m) => m.type === "EXTRA_YOUTUBE_CHAT_MESSAGE").length,
    1,
  );
  await s.dispatch({ ...clock, seekRevision: 2 });
  await s.dispatch(message, s.sender(2));
  assert.equal(
    s.sent.filter((m) => m.type === "EXTRA_YOUTUBE_CHAT_MESSAGE").length,
    1,
  );
});

test("source close and SPA navigation disconnect and reject further messages", async () => {
  for (const event of ["close", "navigate"]) {
    const s = setup();
    await s.dispatch(start);
    await s.dispatch(clock);
    if (event === "close") s.removed(2);
    else s.updated(2, { url: "https://www.youtube.com/watch?v=BM4fWBscpVU" });
    await s.dispatch(
      {
        type: "YOUTUBE_CHAT_MESSAGE",
        connectionId: start.connectionId,
        seekRevision: 1,
        data,
      },
      s.sender(2),
    );
    assert.equal(
      s.sent.filter((m) => m.type === "EXTRA_YOUTUBE_CHAT_MESSAGE").length,
      0,
    );
    assert.equal(
      s.sent.some(
        (m) => m.type === "EXTRA_YOUTUBE_CHAT_STATUS" && m.status === "error",
      ),
      true,
    );
  }
});

test("old stop requests cannot stop a replacement connection", async () => {
  const s = setup();
  await s.dispatch(start);
  await s.dispatch({ ...start, connectionId: "session-two" });
  const stops = s.sent.filter((m) => m.type === "YOUTUBE_CHAT_STOP").length;
  await s.dispatch({
    type: "STOP_EXTRA_YOUTUBE_CHAT",
    connectionId: start.connectionId,
  });
  assert.equal(
    s.sent.filter((m) => m.type === "YOUTUBE_CHAT_STOP").length,
    stops,
  );
  await s.dispatch({ ...clock, connectionId: "session-two" });
  assert.equal(s.sent.at(-1).type, "YOUTUBE_CHAT_CLOCK");
});

test("a source cannot be claimed by a second target", async () => {
  const s = setup();
  await s.dispatch(start);
  const response = await s.dispatch(
    { ...start, connectionId: "other" },
    s.sender(3, "https://www.twitch.tv/other"),
  );
  assert.equal(response.ok, false);
});

test("clocks fail closed after a background restart or source disconnect", async () => {
  const s = setup();
  assert.equal((await s.dispatch(clock)).ok, false);
  await s.dispatch(start);
  assert.equal((await s.dispatch(clock)).ok, true);
  s.removed(2);
  const count = s.sent.filter((m) => m.type === "YOUTUBE_CHAT_CLOCK").length;
  assert.equal((await s.dispatch(clock)).ok, false);
  assert.equal(
    s.sent.filter((m) => m.type === "YOUTUBE_CHAT_CLOCK").length,
    count,
  );
});

test("an existing source tab is reused without opening a new tab", async () => {
  const s = setup();
  assert.equal((await s.dispatch(start)).ok, true);
  assert.equal(s.createdTabs.length, 0);
  assert.equal(s.sent.find((m) => m.type === "YOUTUBE_CHAT_START").tabId, 2);
});

test("a missing source tab is opened once, reused on re-apply, and never closed", async () => {
  const s = setup({ autoOpen: true });
  assert.equal((await s.dispatch(start)).ok, true);
  assert.equal(s.createdTabs.length, 1);
  assert.equal(
    s.createdTabs[0].url,
    "https://www.youtube.com/watch?v=aT2ZZCEEwzg",
  );
  assert.equal(s.createdTabs[0].active, false);
  assert.equal(s.sent.find((m) => m.type === "YOUTUBE_CHAT_START").tabId, 9);

  await s.dispatch({ ...start, connectionId: "session-two" });
  assert.equal(s.createdTabs.length, 1);

  await s.dispatch({
    type: "STOP_EXTRA_YOUTUBE_CHAT",
    connectionId: "session-two",
  });
  assert.deepEqual(s.removedTabs, []);
  assert.equal(
    s.sent.some((m) => m.type === "YOUTUBE_CHAT_STOP"),
    true,
  );
});

test("a known source tab is reused while it reloads instead of opening a new tab", async () => {
  const s = setup();
  assert.equal((await s.dispatch(start)).ok, true);

  s.updated(2, { status: "loading" });
  s.failProbes(1);

  const retry = { ...start, connectionId: "session-two" };
  assert.equal((await s.dispatch(retry)).ok, true);
  assert.equal(s.createdTabs.length, 0);
  assert.equal(
    s.sent.filter((m) => m.type === "YOUTUBE_CHAT_START").at(-1).tabId,
    2,
  );
});

test("Twitch channel navigation disconnects, then re-applying finds the same source", async () => {
  const s = setup();
  const firstChannel = s.sender(1, "https://www.twitch.tv/first_channel");
  const secondChannel = s.sender(1, "https://www.twitch.tv/second_channel");
  assert.equal((await s.dispatch(start, firstChannel)).ok, true);
  await s.dispatch(clock, firstChannel);

  s.updated(1, { url: secondChannel.url });
  assert.equal(
    s.sent.some((m) => m.type === "YOUTUBE_CHAT_STOP" && m.tabId === 2),
    true,
  );
  await s.dispatch(
    {
      type: "YOUTUBE_CHAT_MESSAGE",
      connectionId: start.connectionId,
      seekRevision: 1,
      data,
    },
    s.sender(2),
  );
  assert.equal(
    s.sent.filter((m) => m.type === "EXTRA_YOUTUBE_CHAT_MESSAGE").length,
    0,
  );

  const retry = { ...start, connectionId: "session-two" };
  assert.equal((await s.dispatch(retry, secondChannel)).ok, true);
  assert.equal(
    (await s.dispatch({ ...clock, connectionId: "session-two" }, secondChannel))
      .ok,
    true,
  );
  assert.equal(s.createdTabs.length, 0);
});

test("a delayed source-start response cannot invalidate a replacement session", async () => {
  const s = setup({ deferFirstStart: true });
  const pending = s.dispatch(start);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.sent.at(-1).type, "YOUTUBE_CHAT_START");
  assert.equal(
    (await s.dispatch({ ...start, connectionId: "session-two" })).ok,
    true,
  );
  s.releaseStart();
  assert.equal((await pending).ok, false);
  assert.equal(
    (await s.dispatch({ ...clock, connectionId: "session-two" })).ok,
    true,
  );
  assert.equal(s.sent.at(-1).connectionId, "session-two");
});
