import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const isRecord = (value) => value !== null && typeof value === "object";
const flush = () => new Promise(setImmediate);
const compile = (path, module = ts.ModuleKind.None) =>
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module },
  }).outputText;
const clientCode = compile("../src/content/subtitles/translation.ts");
const backgroundCode = compile(
  "../src/background/subtitle-translation.ts",
  ts.ModuleKind.CommonJS,
);

function client() {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const feedback = [];
  const preferences = {
    enabled: true,
    mode: "bilingual",
    targetLanguage: "en",
    preferNative: false,
    useNativeSecondaryTrack: false,
  };
  let enabled = true;
  let lines = [];
  const context = {
    Date: { now: () => now },
    setTimeout: (callback, delay) => {
      timers.set(++nextTimer, { callback, at: now + delay });
      return nextTimer;
    },
    clearTimeout: (id) => timers.delete(id),
    chrome: {
      runtime: {
        sendMessage: (msg) =>
          new Promise((resolve, reject) =>
            requests.push({ message: msg, resolve, reject }),
          ),
      },
    },
    PipCompanion: { util: { isRecord, getMessage: (key) => key } },
  };
  vm.runInNewContext(clientCode, context);
  const runtime = context.PipCompanion.SubtitleTranslation.create({
    getPreferences: () => preferences,
    isSubtitlesEnabled: () => enabled,
    isSubtitleTranslationSuspended: () => false,
    isNativeSecondaryActive: () => false,
    getNativeSecondaryLines: () => [],
    hasSupportedTrack: () => true,
    prefersNativeSubtitle: () => false,
    getPreferNativeSecondaryLines: () => null,
    showFeedback: (msg) => feedback.push(msg),
    render: () => runtime.getRenderedSubtitleLines(lines),
  });
  return {
    requests,
    feedback,
    runtime,
    preferences,
    render(text) {
      lines = text ? [{ segments: [{ text }] }] : [];
      return runtime.getRenderedSubtitleLines(lines);
    },
    async tick(ms = 350) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
      await flush();
    },
    toggle(value) {
      enabled = value;
      runtime.onSubtitlesEnabledChanged(value);
    },
    change(patch) {
      const previous = { ...preferences };
      Object.assign(preferences, patch);
      runtime.onPreferencesChanged(previous, preferences);
    },
    async succeed(i = requests.length - 1) {
      const request = requests[i];
      request.resolve({
        ok: true,
        translations: request.message.texts.map((text) => `translated ${text}`),
      });
      await flush();
    },
  };
}

test("progressive captions wait for stability and send only the latest text", async () => {
  const c = client();
  for (let i = 1; i <= 20; i++) {
    c.render("abcdefghijklmnopqrst".slice(0, i));
    await c.tick(20);
  }
  assert.equal(c.requests.length, 0);
  await c.tick();
  assert.equal(c.requests.length, 1);
  assert.deepEqual([...c.requests[0].message.texts], ["abcdefghijklmnopqrst"]);
});

test("only one client request is in flight and obsolete queued captions are dropped", async () => {
  const c = client();
  c.render("first");
  await c.tick();
  for (let i = 0; i < 100; i++) {
    c.render(`cue ${i}`);
    await c.tick();
  }
  assert.equal(c.requests.length, 1);
  await c.succeed(0);
  await c.tick();
  assert.equal(c.requests.length, 2);
  assert.deepEqual([...c.requests[1].message.texts], ["cue 99"]);
});

test("failures stop automatic requests, including new and paused captions", async () => {
  const c = client();
  c.render("first");
  await c.tick();
  c.requests[0].resolve({ ok: false, error: "request-failed" });
  await flush();
  for (let i = 0; i < 30; i++) {
    c.render(`cue ${i}`);
    await c.tick(16000);
  }
  assert.equal(c.requests.length, 1);
  assert.equal(c.feedback.length, 1);
  c.change({ enabled: false });
  c.change({ enabled: true });
  c.render("retry explicitly");
  await c.tick();
  assert.equal(c.requests.length, 2);
});

test("subtitle off/on preserves paid cache and cancels queued work", async () => {
  const c = client();
  c.render("cached");
  await c.tick();
  await c.succeed();
  c.toggle(false);
  c.toggle(true);
  c.render("cached");
  await c.tick();
  assert.equal(c.requests.length, 1);
  c.render("never send");
  c.toggle(false);
  await c.tick();
  assert.equal(c.requests.length, 1);
});

test("display-only changes preserve pending work; target changes discard queued text", async () => {
  const c = client();
  c.render("first");
  await c.tick();
  c.change({ mode: "translation-only" });
  await c.succeed();
  c.render("first");
  await c.tick();
  assert.equal(c.requests.length, 1);
  c.render("old target");
  c.change({ targetLanguage: "ja" });
  c.render("new target");
  await c.tick();
  assert.equal(c.requests[1].message.targetLanguage, "ja");
  assert.deepEqual([...c.requests[1].message.texts], ["new target"]);
});

const config = {
  provider: "microsoft",
  microsoftKey: "mock-key",
  microsoftRegion: "eastasia",
  googleKey: "",
  deeplKey: "",
};
function background({ delayEnabled = false, ignoreAbort = false } = {}) {
  let listener, storageListener, resolveEnabled;
  let now = 1000;
  const fetches = [];
  const currentConfig = { ...config };
  const preferences = {
    enabled: true,
    targetLanguage: "en",
    useNativeSecondaryTrack: false,
  };
  const messageHandlers = new Map();
  const runtimeMessageDispatcher = {
    addListener(types, handler) {
      for (const type of typeof types === "string" ? [types] : types) {
        const handlers = messageHandlers.get(type) ?? [];
        handlers.push(handler);
        messageHandlers.set(type, handlers);
      }
      listener = (msg, sender, sendResponse) => {
        let keepChannelOpen = false;
        for (const handler of messageHandlers.get(msg.type) ?? [])
          if (handler(msg, sender, sendResponse) === true)
            keepChannelOpen = true;
        return keepChannelOpen;
      };
    },
  };
  const context = {
    exports: {},
    require: (path) =>
      path.includes("message-dispatcher")
        ? { runtimeMessageDispatcher }
        : { isRecord },
    URL,
    AbortController,
    Date: { now: () => now },
    setTimeout: () => 1,
    clearTimeout() {},
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        const request = { url, init, resolve, reject };
        fetches.push(request);
        if (!ignoreAbort)
          init.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
      }),
    chrome: {
      tabs: { onRemoved: { addListener() {} } },
      runtime: {
        getURL: () => "chrome-extension://test/",
        onMessage: { addListener: (fn) => (listener = fn) },
      },
      storage: {
        onChanged: { addListener: (fn) => (storageListener = fn) },
        local: {
          get: async () => ({
            subtitleTranslationConfig: { ...currentConfig },
            subtitleTranslationPreferences: { ...preferences },
          }),
        },
        session: {
          get: async (key) =>
            key === "pipTabId"
              ? { pipTabId: 1 }
              : delayEnabled
                ? new Promise((resolve) => (resolveEnabled = resolve))
                : { "pipSubtitlesEnabled:1": true },
          set: async () => {},
        },
      },
    },
  };
  vm.runInNewContext(backgroundCode, context);
  context.exports.registerSubtitleTranslationListener();
  const sender = { tab: { id: 1 }, url: "https://example.org/watch" };
  const send = (msg, callback = () => {}) => listener(msg, sender, callback);
  send({ type: "PIP_STATE_CHANGED", pipOpen: true, subtitlesEnabled: true });
  return {
    fetches,
    send,
    preferences,
    advance(ms = 350) {
      now += ms;
    },
    translate(callback, text = "same caption") {
      send(
        {
          type: "TRANSLATE_SUBTITLE_CUES",
          targetLanguage: preferences.targetLanguage,
          texts: [text],
        },
        callback,
      );
    },
    succeed(i = fetches.length - 1) {
      fetches[i].resolve({
        ok: true,
        json: async () => [
          { translations: [{ text: "translated", to: "en" }] },
        ],
      });
    },
    storage(changes) {
      storageListener(changes, "local");
    },
    changeConfig(patch) {
      const oldValue = { ...currentConfig };
      Object.assign(currentConfig, patch);
      storageListener(
        {
          subtitleTranslationConfig: {
            oldValue,
            newValue: { ...currentConfig },
          },
        },
        "local",
      );
    },
    resolveEnabled() {
      resolveEnabled({ "pipSubtitlesEnabled:1": true });
    },
  };
}

test("closing PiP invalidates requests still awaiting storage", async () => {
  const b = background({ delayEnabled: true });
  b.translate();
  await flush();
  b.send({ type: "PIP_STATE_CHANGED", pipOpen: false });
  b.resolveEnabled();
  await flush();
  assert.equal(b.fetches.length, 0);
});

test("background coalesces identical requests and reuses completed results", async () => {
  const b = background();
  const responses = [];
  for (let i = 0; i < 30; i++) b.translate((res) => responses.push(res));
  await flush();
  assert.equal(b.fetches.length, 1);
  b.succeed();
  await flush();
  assert.equal(responses.length, 30);
  assert.ok(responses.every((res) => res.ok));
  b.advance();
  b.translate((res) => responses.push(res));
  await flush();
  assert.equal(b.fetches.length, 1);
  assert.equal(responses.at(-1).ok, true);
});

test("turning translation off aborts the old fetch", async () => {
  const b = background();
  b.translate();
  await flush();
  b.storage({
    subtitleTranslationPreferences: {
      oldValue: { ...b.preferences },
      newValue: { ...b.preferences, enabled: false },
    },
  });
  assert.equal(b.fetches[0].init.signal.aborted, true);
  await flush();
});

test("provider changes abort old fetches; unrelated credentials do not", async () => {
  const b = background();
  b.translate();
  await flush();
  b.storage({
    subtitleTranslationConfig: {
      oldValue: config,
      newValue: { ...config, deeplKey: "other-key" },
    },
  });
  assert.equal(b.fetches[0].init.signal.aborted, false);
  b.storage({
    subtitleTranslationConfig: {
      oldValue: config,
      newValue: { ...config, provider: "google", googleKey: "mock-google" },
    },
  });
  assert.equal(b.fetches[0].init.signal.aborted, true);
  await flush();
});

for (const [status, error] of [
  [401, "not-configured"],
  [403, "not-configured"],
  [429, "rate-limited"],
  [456, "quota-exceeded"],
  [500, "request-failed"],
]) {
  test(`HTTP ${status} stops new and repeated captions until explicit recovery`, async () => {
    const b = background();
    const responses = [];
    b.translate((res) => responses.push(res));
    await flush();
    b.fetches[0].resolve({ ok: false, status });
    await flush();
    for (let i = 0; i < 30; i++) {
      b.advance(16000);
      b.translate(undefined, `new ${i}`);
      await flush();
    }
    assert.equal(b.fetches.length, 1);
    assert.equal(responses[0].error, error);
    b.storage({
      subtitleTranslationPreferences: {
        oldValue: { ...b.preferences, enabled: false },
        newValue: b.preferences,
      },
    });
    b.translate();
    await flush();
    assert.equal(b.fetches.length, 2);
  });
}

test("distinct requests obey both concurrency and minimum dispatch interval", async () => {
  const b = background();
  b.translate();
  await flush();
  b.advance();
  b.translate(undefined, "other");
  await flush();
  assert.equal(b.fetches.length, 1);
  b.succeed();
  await flush();
  b.translate(undefined, "other");
  await flush();
  assert.equal(b.fetches.length, 2);
  b.succeed();
  await flush();
  b.translate(undefined, "third");
  await flush();
  assert.equal(b.fetches.length, 2);
  b.advance();
  b.translate(undefined, "third");
  await flush();
  assert.equal(b.fetches.length, 3);
});

test("cache is target-scoped; mode changes do not abort a fetch", async () => {
  const b = background();
  b.translate();
  await flush();
  b.storage({
    subtitleTranslationPreferences: {
      oldValue: b.preferences,
      newValue: { ...b.preferences, mode: "bilingual" },
    },
  });
  assert.equal(b.fetches[0].init.signal.aborted, false);
  b.succeed();
  await flush();
  b.advance();
  const oldValue = { ...b.preferences };
  b.preferences.targetLanguage = "ja";
  b.storage({
    subtitleTranslationPreferences: { oldValue, newValue: b.preferences },
  });
  b.translate();
  await flush();
  assert.equal(b.fetches.length, 2);
});

test("target changes during storage lookup invalidate the old request", async () => {
  const b = background({ delayEnabled: true });
  b.translate();
  await flush();
  const oldValue = { ...b.preferences };
  b.preferences.targetLanguage = "ja";
  b.storage({
    subtitleTranslationPreferences: { oldValue, newValue: b.preferences },
  });
  b.resolveEnabled();
  await flush();
  assert.equal(b.fetches.length, 0);
});

test("a response arriving after cancellation cannot refill the cache", async () => {
  const b = background({ ignoreAbort: true });
  b.translate();
  await flush();
  b.send({ type: "PIP_STATE_CHANGED", pipOpen: false });
  b.succeed();
  await flush();
  b.advance();
  b.send({ type: "PIP_STATE_CHANGED", pipOpen: true, subtitlesEnabled: true });
  b.translate();
  await flush();
  assert.equal(b.fetches.length, 2);
});

test("transport failures do not retry even after time passes", async () => {
  const b = background();
  b.translate();
  await flush();
  b.fetches[0].reject(new Error("mock network failure"));
  await flush();
  b.advance(60000);
  b.translate(undefined, "other");
  await flush();
  assert.equal(b.fetches.length, 1);
});

test("client caches targets separately and ignores inactive-provider credential changes", async () => {
  const c = client();
  c.render("same");
  await c.tick();
  await c.succeed();
  c.runtime.onConfigChanged(config, { ...config, deeplKey: "other-mock-key" });
  c.render("same");
  await c.tick();
  assert.equal(c.requests.length, 1);
  c.change({ targetLanguage: "ja" });
  c.render("same");
  await c.tick();
  await c.succeed();
  c.change({ targetLanguage: "en" });
  c.render("same");
  await c.tick();
  assert.equal(c.requests.length, 2);
});

test("client retries only latest busy caption and ignores stale target results", async () => {
  const c = client();
  c.render("first");
  await c.tick();
  c.render("latest");
  c.requests[0].resolve({ ok: false, error: "busy" });
  await flush();
  await c.tick();
  assert.deepEqual([...c.requests[1].message.texts], ["latest"]);
  c.change({ targetLanguage: "ja" });
  c.render("new");
  await c.succeed(1);
  await c.tick();
  assert.equal(c.requests[2].message.targetLanguage, "ja");
  assert.equal(c.feedback.length, 0);
});

test("switching providers preserves each successful client cache", async () => {
  const c = client();
  c.render("same");
  await c.tick();
  await c.succeed();
  const google = { ...config, provider: "google", googleKey: "mock-google" };
  c.runtime.onConfigChanged(config, google);
  c.render("same");
  await c.tick();
  assert.equal(c.requests.length, 2);
  await c.succeed();
  const microsoft = { ...google, provider: "microsoft" };
  c.runtime.onConfigChanged(google, microsoft);
  c.render("same");
  await c.tick();
  assert.equal(c.requests.length, 2);
  c.runtime.onConfigChanged(microsoft, {
    ...microsoft,
    microsoftKey: "replacement-mock-key",
  });
  c.render("same");
  await c.tick();
  assert.equal(c.requests.length, 3);
});

test("missing target preference retains the shared default language", async () => {
  const b = background();
  delete b.preferences.targetLanguage;
  b.send({
    type: "TRANSLATE_SUBTITLE_CUES",
    targetLanguage: "zh-Hant",
    texts: ["same caption"],
  });
  await flush();
  assert.equal(b.fetches.length, 1);
  assert.equal(b.fetches[0].url.searchParams.get("to"), "zh-Hant");
});

test("background retains provider caches but invalidates replaced credentials", async () => {
  const b = background();
  b.translate();
  await flush();
  b.succeed();
  await flush();
  b.advance();
  b.changeConfig({ provider: "google", googleKey: "mock-google" });
  b.translate();
  await flush();
  assert.equal(b.fetches.length, 2);
  b.fetches[1].resolve({
    ok: true,
    json: async () => ({
      data: { translations: [{ translatedText: "google translation" }] },
    }),
  });
  await flush();
  b.advance();
  b.changeConfig({ provider: "microsoft" });
  b.translate();
  await flush();
  assert.equal(b.fetches.length, 2);
  b.changeConfig({ microsoftKey: "replacement-mock-key" });
  b.translate();
  await flush();
  assert.equal(b.fetches.length, 3);
});
