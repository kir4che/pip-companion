import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const providers = ["none", "microsoft", "google", "deepl"];
const source = ts.transpileModule(
  readFileSync(new URL("../src/content/pip/ui.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = {
      add: (...names) => {
        this.className = [
          ...new Set([...this.className.split(/\s+/), ...names]),
        ]
          .filter(Boolean)
          .join(" ");
      },
      remove: (...names) => {
        this.className = this.className
          .split(/\s+/)
          .filter((name) => name && !names.includes(name))
          .join(" ");
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.className.split(/\s+/).includes(name);
        if (enabled) this.classList.add(name);
        else this.classList.remove(name);
        return enabled;
      },
    };
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
    this.textContent = "";
  }

  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }

  get value() {
    if (this.tagName !== "SELECT") return this._value ?? "";
    return (
      this.options.find((option) => option.selected)?.value ??
      this.options[0]?.value ??
      ""
    );
  }

  set value(value) {
    this._value = String(value ?? "");
    if (this.tagName === "SELECT")
      for (const option of this.options)
        option.selected = option.value === this._value;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target ??= this;
    for (const callback of this.listeners.get(event.type) ?? [])
      callback(event);
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click", target: this, preventDefault() {} });
  }

  contains(target) {
    return (
      target === this || this.children.some((child) => child.contains(target))
    );
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument.activeElement === this)
      this.ownerDocument.activeElement = null;
  }

  getBoundingClientRect() {
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  }

  get clientWidth() {
    return 640;
  }

  get clientHeight() {
    return 360;
  }

  get offsetWidth() {
    return 0;
  }

  get offsetHeight() {
    return 0;
  }
}

function createDocument() {
  const doc = {
    activeElement: null,
    documentElement: null,
    head: null,
    body: null,
    createElement(tagName) {
      return new FakeElement(tagName, doc);
    },
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName, doc);
    },
    createTextNode(text) {
      return {
        tagName: "#text",
        textContent: text,
        children: [],
        contains: () => false,
      };
    },
    addEventListener() {},
    hasFocus: () => true,
  };
  doc.documentElement = doc.createElement("html");
  doc.head = doc.createElement("head");
  doc.body = doc.createElement("body");
  return doc;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function createUi(initialProvider, options = {}) {
  const doc = createDocument();
  const feedback = [];
  const secondaryTracks = options.secondaryTracks ?? [
    { id: "secondary-en", label: "English", language: "en" },
  ];
  const configuredProviders =
    options.configuredProviders ?? providers.filter((item) => item !== "none");
  const win = {
    document: doc,
    addEventListener() {},
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    innerWidth: 640,
    innerHeight: 360,
    outerWidth: 640,
    outerHeight: 360,
    focus() {},
  };
  const preferences = {
    enabled: true,
    mode: "bilingual",
    targetLanguage: "en",
    preferNative: false,
    useNativeSecondaryTrack: initialProvider === "none",
  };
  let provider = initialProvider === "none" ? "microsoft" : initialProvider;
  let queries = 0;
  const methods = {
    volumeIconPath: "",
    canSendDanmaku: false,
    getSubtitleTracks: () => [],
    getSecondarySubtitleTracks: () => secondaryTracks,
    getSelectedSecondarySubtitleTrack: () =>
      options.selectedSecondarySubtitleTrack ?? secondaryTracks[0]?.id ?? null,
    getSubtitleTranslationPreferences: () => preferences,
    getSubtitlesEnabled: () => true,
    getSubtitleTranslationServices: () => {
      const queryIndex = queries++;
      if (options.getServices) return options.getServices(queryIndex);
      if (queryIndex > 0) return Promise.resolve(null);
      return Promise.resolve({
        provider,
        services: providers
          .filter((item) => item !== "none")
          .map((item) => ({
            provider: item,
            configured: configuredProviders.includes(item),
          })),
      });
    },
    getSubtitleTranslationLanguages: async () => [
      { code: "en", label: "English" },
    ],
    setSubtitleTranslationProvider: async (nextProvider) => {
      if (options.providerSaveSucceeds === false) return false;
      provider = nextProvider;
      preferences.useNativeSecondaryTrack = false;
      return true;
    },
    setSubtitleTranslationPreferences: async (nextPreferences) => {
      Object.assign(preferences, nextPreferences);
      return true;
    },
    getPlaylist: () => [],
    getShortcut: () => "",
    getHtmlLanguage: () => "en",
    updatePlaybackUi() {},
    formatTime: () => "0:00",
    getMaxVolume: () => 1,
    getVideo: () => video,
    isSubtitleTranslationSuspended: () => false,
    hasSubtitleSource: () => true,
    showFeedback: (message) => feedback.push(message),
  };
  const actions = new Proxy(methods, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "string" && key.startsWith("get"))
        return () => undefined;
      return () => undefined;
    },
  });
  const video = {
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    paused: false,
    playbackRate: 1,
    addEventListener() {},
    removeEventListener() {},
  };
  const context = {
    PipCompanion: {
      util: {
        getMessage: (key) => key,
        getHtmlLanguage: () => "en",
        formatShortcut: () => "",
      },
      customSelect: {
        enhance() {},
        disposeForSelect() {},
        closeForSelect() {},
        containsTarget: () => false,
        isOpenForTarget: () => false,
      },
      site: { isNetflixHost: () => false },
      subtitleTranslationSettings: {
        LANGUAGES: ["en", "ja"],
        getLanguageLabel: (code) => code,
      },
    },
    chrome:
      options.runtimeAvailable === false
        ? {}
        : { runtime: { getURL: (path) => path } },
    location: { hostname: "example.com", origin: "https://example.com" },
    window: win,
    document: doc,
    setTimeout: () => 1,
    clearTimeout() {},
    Date,
    requestAnimationFrame: win.requestAnimationFrame,
  };
  vm.runInNewContext(source, context);
  const ui = context.PipCompanion.PipUI.create(win, actions, video);
  const findByLabel = (label) =>
    [...allElements(doc.body)].find(
      (element) => element.getAttribute("aria-label") === label,
    );
  const service = findByLabel("pipTranslationSource");
  const mode = findByLabel("pipTranslationDisplayMode");
  const language = findByLabel("pipTranslationLanguage");
  const preferNative = findByLabel("pipTranslationPreferNative");
  const translationToggle = findByLabel("pipTranslationEnable");
  const panel = [...allElements(doc.body)].find(
    (element) => element.id === "pip-subtitle-translation-panel",
  );
  const panelButton = [...allElements(doc.body)].find(
    (element) => element.className === "translation-button",
  );
  panelButton.click();
  return {
    ui,
    actions,
    feedback,
    preferences,
    panel,
    service,
    mode,
    language,
    preferNative,
    translationToggle,
    async select(nextProvider) {
      service.value = nextProvider;
      service.dispatchEvent({ type: "change" });
      await flush();
      await flush();
    },
  };
}

function* allElements(root) {
  if (typeof root.getAttribute === "function") yield root;
  for (const child of root.children ?? []) yield* allElements(child);
}

for (const from of providers) {
  for (const to of providers) {
    if (from === to) continue;
    test(`subtitle source switch ${from} → ${to} keeps settings usable`, async () => {
      const ui = createUi(from);
      await flush();
      assert.equal(
        ui.panel.hidden,
        false,
        "translation settings panel stays open",
      );

      await ui.select(to);

      assert.equal(ui.service.value, to);
      assert.equal(ui.service.disabled, false);
      assert.equal(ui.mode.value, "bilingual");
      assert.equal(ui.language.value, to === "none" ? "secondary-en" : "en");
      assert.equal(
        ui.panel.hidden,
        false,
        "switch does not require reopening the panel",
      );
      assert.equal(ui.translationToggle.disabled, false);
      assert.equal(ui.mode.disabled, false);
      assert.equal(ui.language.disabled, false);
      assert.equal(
        ui.preferNative.disabled,
        to === "none",
        "prefer-native is only disabled for native-secondary mode",
      );
      assert.equal(ui.preferNative.checked, false);
    });
  }
}

test("PiP UI still initializes when the extension runtime is unavailable", () => {
  assert.doesNotThrow(() => createUi("none", { runtimeAvailable: false }));
});

test("failed provider setup keeps the native source and reports failure", async () => {
  const ui = createUi("none", {
    providerSaveSucceeds: false,
    getServices: async () => ({
      provider: "microsoft",
      services: ["microsoft", "google", "deepl"].map((provider) => ({
        provider,
        configured: true,
      })),
    }),
  });
  await flush();

  await ui.select("google");

  assert.equal(ui.preferences.useNativeSecondaryTrack, true);
  assert.equal(ui.service.value, "none");
  assert.equal(ui.feedback.includes("pipTranslationServiceUnavailable"), true);
  assert.equal(ui.translationToggle.disabled, false);
  assert.equal(ui.mode.disabled, false);
  assert.equal(ui.language.disabled, false);
});

test("unconfigured provider and missing native tracks keep settings disabled", async (t) => {
  await t.test("unconfigured machine-translation provider", async () => {
    const ui = createUi("google", { configuredProviders: ["microsoft"] });
    await flush();

    assert.equal(
      ui.service.options.find((option) => option.value === "google").disabled,
      true,
    );
    assert.equal(ui.translationToggle.disabled, true);
    assert.equal(ui.mode.disabled, true);
    assert.equal(ui.language.disabled, true);
  });

  await t.test("native secondary source without available tracks", async () => {
    const ui = createUi("none", { secondaryTracks: [] });
    await flush();

    assert.equal(ui.translationToggle.disabled, true);
    assert.equal(ui.mode.disabled, true);
    assert.equal(ui.language.disabled, true);
    assert.equal(ui.preferNative.disabled, true);
  });
});

test("stale service query cannot overwrite a newer provider state", async () => {
  const pendingQueries = [];
  const ui = createUi("google", {
    getServices: () => new Promise((resolve) => pendingQueries.push(resolve)),
  });
  ui.ui.refreshSubtitleTranslationServices();
  const catalog = (provider) => ({
    provider,
    services: ["microsoft", "google", "deepl"].map((item) => ({
      provider: item,
      configured: item === provider,
    })),
  });

  pendingQueries[1](catalog("google"));
  await flush();
  pendingQueries[0](catalog("microsoft"));
  await flush();

  assert.equal(ui.service.value, "google");
  assert.equal(
    ui.service.options.find((option) => option.value === "google").disabled,
    false,
  );
  assert.equal(
    ui.service.options.find((option) => option.value === "microsoft").disabled,
    true,
  );
  assert.equal(ui.translationToggle.disabled, false);
  assert.equal(ui.mode.disabled, false);
  assert.equal(ui.language.disabled, false);
});
