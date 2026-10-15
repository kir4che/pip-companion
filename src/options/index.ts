"use strict";
export {};

const util = globalThis.PipCompanion.util;
let uiLanguage: unknown;
try {
  ({ uiLanguage } = await chrome.storage.local.get("uiLanguage"));
} catch {
  // 儲存空間無法使用時，改採瀏覽器語言。
}
util.setLanguagePreference(uiLanguage);
const danmakuSettings = globalThis.PipCompanion.danmakuSettings;
const subtitleSettings = globalThis.PipCompanion.subtitleSettings;
const subtitleTranslationSettings =
  globalThis.PipCompanion.subtitleTranslationSettings;
const t = util.getMessage;
const messagePlaceholder = /__MSG_([A-Za-z0-9_@]+)__/g;
const localizeText = (value: string) =>
  value.replace(messagePlaceholder, (_, key: string) => t(key));
const textWalker = document.createTreeWalker(
  document.documentElement,
  NodeFilter.SHOW_TEXT,
);
const localizedTextNodes: { node: Text; source: string }[] = [];
while (textWalker.nextNode()) {
  const node = textWalker.currentNode as Text;
  const source = node.textContent ?? "";
  if (source.includes("__MSG_")) localizedTextNodes.push({ node, source });
}
const localizedAttributes: { attribute: Attr; source: string }[] = [];
for (const element of document.querySelectorAll("*")) {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.value.includes("__MSG_"))
      localizedAttributes.push({ attribute, source: attribute.value });
  }
}

function refreshLocalizedMarkup() {
  for (const { node, source } of localizedTextNodes)
    node.textContent = localizeText(source);
  for (const { attribute, source } of localizedAttributes)
    attribute.value = localizeText(source);
  document.documentElement.lang = util.getHtmlLanguage();
}

refreshLocalizedMarkup();
globalThis.PipCompanion.customSelect.enhanceAll();

const statusEl = document.querySelector("#status") as HTMLElement;
let statusClearTimer: ReturnType<typeof setTimeout> | undefined;

function showStatus(message: string, error = false) {
  statusEl.textContent = message;
  statusEl.dataset.error = String(error);
  if (statusClearTimer) clearTimeout(statusClearTimer);
  if (message) {
    statusClearTimer = setTimeout(() => {
      statusEl.textContent = "";
      statusClearTimer = undefined;
    }, 3000);
  }
}

const seekSecondsSelect = document.querySelector(
  "#seek-seconds",
) as HTMLSelectElement;
const languageSelect = document.querySelector(
  "#language-select",
) as HTMLSelectElement;

languageSelect.value = util.getLocale();
languageSelect.addEventListener("change", async () => {
  const previousLanguage = util.getLanguagePreference();
  const nextLanguage = util.setLanguagePreference(languageSelect.value);
  try {
    await chrome.storage.local.set({ uiLanguage: nextLanguage });
    refreshOptionsLocale();
  } catch {
    util.setLanguagePreference(previousLanguage);
    languageSelect.value = util.getLocale();
    refreshOptionsLocale();
    showStatus(t("popupLanguageSaveFailed"), true);
  }
});

for (const seconds of util.SEEK_SECONDS_OPTIONS) {
  const option = document.createElement("option");
  option.value = String(seconds);
  option.textContent = t("popupSeconds", String(seconds));
  seekSecondsSelect.append(option);
}

function refreshOptionsLocale() {
  refreshLocalizedMarkup();
  for (const option of seekSecondsSelect.options)
    option.textContent = t("popupSeconds", option.value);
  renderShortcuts();
  renderShortcutActionButtons();
  renderDanmakuStyle();
  renderSubtitleStyle();
  renderSubtitleTranslationConfig();
}

const subtitleTranslationProvider = document.querySelector(
  "#subtitle-translation-provider",
) as HTMLSelectElement;
const microsoftTranslationConfig = document.querySelector(
  "#microsoft-translation-config",
) as HTMLElement;
const googleTranslationConfig = document.querySelector(
  "#google-translation-config",
) as HTMLElement;
const deeplTranslationConfig = document.querySelector(
  "#deepl-translation-config",
) as HTMLElement;
const microsoftTranslationKey = document.querySelector(
  "#microsoft-translation-key",
) as HTMLInputElement;
const microsoftTranslationRegion = document.querySelector(
  "#microsoft-translation-region",
) as HTMLInputElement;
const googleTranslationKey = document.querySelector(
  "#google-translation-key",
) as HTMLInputElement;
const deeplTranslationKey = document.querySelector(
  "#deepl-translation-key",
) as HTMLInputElement;
const microsoftTranslationKeyDisplay = document.querySelector(
  "#microsoft-translation-key-display",
) as HTMLOutputElement;
const googleTranslationKeyDisplay = document.querySelector(
  "#google-translation-key-display",
) as HTMLOutputElement;
const deeplTranslationKeyDisplay = document.querySelector(
  "#deepl-translation-key-display",
) as HTMLOutputElement;
const microsoftTranslationKeyLabel = document.querySelector(
  "#microsoft-translation-key-label",
) as HTMLLabelElement;
const googleTranslationKeyLabel = document.querySelector(
  "#google-translation-key-label",
) as HTMLLabelElement;
const deeplTranslationKeyLabel = document.querySelector(
  "#deepl-translation-key-label",
) as HTMLLabelElement;
const translationTestButton = document.querySelector(
  "#subtitle-translation-test",
) as HTMLButtonElement;
const translationSaveButton = document.querySelector(
  "#subtitle-translation-save",
) as HTMLButtonElement;
const translationRemoveButton = document.querySelector(
  "#subtitle-translation-remove",
) as HTMLButtonElement;
let translationTestInProgress = false;
let subtitleTranslationConfig: SubtitleTranslationConfig = {
  provider: "microsoft",
  microsoftKey: "",
  microsoftRegion: "",
  googleKey: "",
  deeplKey: "",
};

function normalizeSubtitleTranslationConfig(
  value: unknown,
): SubtitleTranslationConfig {
  const config = util.isRecord(value) ? value : {};
  return {
    provider:
      config.provider === "google" || config.provider === "deepl"
        ? config.provider
        : "microsoft",
    microsoftKey:
      typeof config.microsoftKey === "string" &&
      config.microsoftKey.length <= 4096
        ? config.microsoftKey
        : "",
    microsoftRegion:
      typeof config.microsoftRegion === "string" &&
      config.microsoftRegion.length <= 100
        ? config.microsoftRegion
        : "",
    googleKey:
      typeof config.googleKey === "string" && config.googleKey.length <= 4096
        ? config.googleKey
        : "",
    deeplKey:
      typeof config.deeplKey === "string" && config.deeplKey.length <= 4096
        ? config.deeplKey
        : "",
  };
}

function maskApiKey(key: string): string {
  const head = key.slice(0, 4);
  const tail = key.length > 8 ? key.slice(-4) : "";
  return tail ? `${head}••••${tail}` : `${head}••••`;
}

function renderTranslationActions() {
  const provider = subtitleTranslationConfig.provider;
  const keyInput =
    provider === "google"
      ? googleTranslationKey
      : provider === "deepl"
        ? deeplTranslationKey
        : microsoftTranslationKey;
  const storedKey = (
    provider === "google"
      ? subtitleTranslationConfig.googleKey
      : provider === "deepl"
        ? subtitleTranslationConfig.deeplKey
        : subtitleTranslationConfig.microsoftKey
  ).trim();
  const hasStoredKey = storedKey !== "";
  const keyDirty = !hasStoredKey && keyInput.value.trim() !== "";
  const region = microsoftTranslationRegion.value.trim();
  const hasRequiredCredentials =
    Boolean(keyDirty || hasStoredKey) &&
    (provider !== "microsoft" ||
      /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i.test(region));
  const regionDirty =
    provider === "microsoft" &&
    region !== subtitleTranslationConfig.microsoftRegion;
  translationSaveButton.hidden = !(keyDirty || regionDirty);
  translationRemoveButton.hidden = !hasStoredKey;
  translationTestButton.disabled =
    translationTestInProgress || !hasRequiredCredentials;
}

function renderSubtitleTranslationConfig() {
  subtitleTranslationProvider.value = subtitleTranslationConfig.provider;
  for (const [input, display, label, key] of [
    [
      microsoftTranslationKey,
      microsoftTranslationKeyDisplay,
      microsoftTranslationKeyLabel,
      subtitleTranslationConfig.microsoftKey,
    ],
    [
      googleTranslationKey,
      googleTranslationKeyDisplay,
      googleTranslationKeyLabel,
      subtitleTranslationConfig.googleKey,
    ],
    [
      deeplTranslationKey,
      deeplTranslationKeyDisplay,
      deeplTranslationKeyLabel,
      subtitleTranslationConfig.deeplKey,
    ],
  ] as const) {
    const hasStoredKey = key.trim() !== "";
    input.hidden = hasStoredKey;
    display.hidden = !hasStoredKey;
    label.htmlFor = hasStoredKey ? "" : input.id;
    display.textContent = hasStoredKey ? maskApiKey(key) : "";
  }
  microsoftTranslationConfig.hidden =
    subtitleTranslationConfig.provider !== "microsoft";
  googleTranslationConfig.hidden =
    subtitleTranslationConfig.provider !== "google";
  deeplTranslationConfig.hidden =
    subtitleTranslationConfig.provider !== "deepl";
  renderTranslationActions();
}

async function saveSubtitleTranslationConfig(
  config: SubtitleTranslationConfig,
  clearKeyInputs = true,
  silent = false,
) {
  try {
    await chrome.storage.local.set({
      [subtitleTranslationSettings.CONFIG_KEY]: config,
    });
    subtitleTranslationConfig = config;
    if (clearKeyInputs) {
      microsoftTranslationKey.value = "";
      googleTranslationKey.value = "";
      deeplTranslationKey.value = "";
    }
    renderSubtitleTranslationConfig();
    if (!silent) showStatus(t("subtitleTranslationSettingsSaved"));
  } catch {
    showStatus(t("subtitleTranslationSettingsSaveFailed"), true);
  }
}

subtitleTranslationProvider.addEventListener("change", () => {
  subtitleTranslationConfig = {
    ...subtitleTranslationConfig,
    provider:
      subtitleTranslationProvider.value === "google" ||
      subtitleTranslationProvider.value === "deepl"
        ? subtitleTranslationProvider.value
        : "microsoft",
  };
  renderSubtitleTranslationConfig();
  void saveSubtitleTranslationConfig(subtitleTranslationConfig, false, true);
});

function getSubtitleTranslationConfigWithInputKey(): SubtitleTranslationConfig {
  const config = { ...subtitleTranslationConfig };
  const keyField = `${config.provider}Key` as const;
  const input = {
    microsoft: microsoftTranslationKey,
    google: googleTranslationKey,
    deepl: deeplTranslationKey,
  }[config.provider];
  const key = input.value.trim();
  if (!config[keyField].trim() && key) config[keyField] = key;
  return config;
}

translationSaveButton.addEventListener("click", () => {
  const config = getSubtitleTranslationConfigWithInputKey();
  if (config.provider === "microsoft")
    config.microsoftRegion = microsoftTranslationRegion.value.trim();
  if (
    config.provider === subtitleTranslationConfig.provider &&
    config.microsoftKey === subtitleTranslationConfig.microsoftKey &&
    config.microsoftRegion === subtitleTranslationConfig.microsoftRegion &&
    config.googleKey === subtitleTranslationConfig.googleKey &&
    config.deeplKey === subtitleTranslationConfig.deeplKey
  ) {
    showStatus(t("subtitleTranslationNoChange"));
    return;
  }
  void saveSubtitleTranslationConfig(config);
});
translationTestButton.addEventListener("click", () => {
  const config = getSubtitleTranslationConfigWithInputKey();
  if (config.provider === "microsoft") {
    const region = microsoftTranslationRegion.value.trim();
    if (region) config.microsoftRegion = region;
  }
  translationTestInProgress = true;
  renderTranslationActions();
  showStatus(t("subtitleTranslationTesting"));
  void chrome.runtime
    .sendMessage({
      type: "TEST_SUBTITLE_TRANSLATION",
      provider: config.provider,
      config,
    } satisfies ExtensionMessage)
    .then(
      (result) =>
        showStatus(
          t(
            result?.ok
              ? "subtitleTranslationTestSuccess"
              : "subtitleTranslationTestFailed",
          ),
          !result?.ok,
        ),
      () => showStatus(t("subtitleTranslationTestFailed"), true),
    )
    .finally(() => {
      translationTestInProgress = false;
      renderTranslationActions();
    });
});
translationRemoveButton.addEventListener("click", () => {
  const config = { ...subtitleTranslationConfig };
  if (config.provider === "microsoft") {
    config.microsoftKey = "";
  } else if (config.provider === "google") {
    config.googleKey = "";
  } else {
    config.deeplKey = "";
  }
  void saveSubtitleTranslationConfig(config, true, true);
});

for (const input of [
  microsoftTranslationKey,
  googleTranslationKey,
  deeplTranslationKey,
  microsoftTranslationRegion,
]) {
  input.addEventListener("input", renderTranslationActions);
}

async function loadSubtitleTranslationConfig() {
  try {
    const stored = await chrome.storage.local.get(
      subtitleTranslationSettings.CONFIG_KEY,
    );
    subtitleTranslationConfig = normalizeSubtitleTranslationConfig(
      stored[subtitleTranslationSettings.CONFIG_KEY],
    );
    microsoftTranslationRegion.value =
      subtitleTranslationConfig.microsoftRegion;
  } catch {
    subtitleTranslationConfig = normalizeSubtitleTranslationConfig(null);
  }
  renderSubtitleTranslationConfig();
}

// 快捷鍵
const shortcuts = new Map<ShortcutKey, Shortcut>();
for (const key of util.SHORTCUT_KEYS) {
  shortcuts.set(key, { ...util.SHORTCUT_DEFAULTS[key] });
}

const shortcutButtons = new Map<ShortcutKey, HTMLButtonElement>();
for (const key of util.SHORTCUT_KEYS) {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-shortcut="${key}"]`,
  );
  if (button) shortcutButtons.set(key, button);
}

let recordingKey: ShortcutKey | null = null;

function renderShortcut(key: ShortcutKey) {
  const button = shortcutButtons.get(key);
  if (!button) return;
  const value = shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key];
  button.textContent =
    recordingKey === key
      ? t(
          key === "pipResizeShortcut"
            ? "popupRecordingResizeShortcut"
            : "popupRecordingShortcut",
        )
      : util.formatShortcut(value, false, true);
  button.setAttribute(
    "aria-label",
    `${shortcutName(key)}: ${button.textContent}`,
  );
}

function renderShortcuts() {
  for (const key of util.SHORTCUT_KEYS) renderShortcut(key);
}

async function loadShortcuts() {
  try {
    const stored = await chrome.storage.local.get(util.SHORTCUT_DEFAULTS);
    for (const key of util.SHORTCUT_KEYS) {
      shortcuts.set(
        key,
        util.normalizeShortcut(stored[key], util.SHORTCUT_DEFAULTS[key]),
      );
    }
  } catch {
    // 預設值已就位
  } finally {
    for (const button of shortcutButtons.values()) button.disabled = false;
    for (const button of clearShortcutButtons.values()) button.disabled = false;
    for (const button of resetShortcutButtons.values()) button.disabled = false;
  }
  renderShortcuts();
  renderShortcutActionButtons();
}

function sameShortcut(a: Shortcut, b: Shortcut) {
  return (
    a.code === b.code &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta
  );
}

function shortcutName(key: ShortcutKey) {
  return (
    shortcutButtons
      .get(key)
      ?.closest(".shortcut-item")
      ?.querySelector(".shortcut-name")?.textContent ?? t("popupOtherShortcut")
  );
}

const clearShortcutButtons = new Map<ShortcutKey, HTMLButtonElement>();
const resetShortcutButtons = new Map<ShortcutKey, HTMLButtonElement>();
for (const [key, shortcutButton] of shortcutButtons) {
  const actions = document.createElement("div");
  actions.className = "shortcut-actions";
  shortcutButton.before(actions);
  actions.append(shortcutButton);

  const clearButton = document.createElement("button");
  clearButton.className = "shortcut-clear-btn";
  clearButton.type = "button";
  clearButton.disabled = true;
  clearButton.title = t("popupClearShortcut");
  clearButton.setAttribute("data-clear-shortcut", key);
  const clearIcon = document.createElement("img");
  clearIcon.src = chrome.runtime.getURL("assets/clear-icon.svg");
  clearIcon.alt = "";
  clearButton.append(clearIcon);
  clearButton.addEventListener(
    "click",
    () =>
      void saveShortcut(key, {
        code: "",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      }),
  );
  actions.append(clearButton);
  clearShortcutButtons.set(key, clearButton);

  const resetButton = document.createElement("button");
  resetButton.className = "shortcut-reset-btn";
  resetButton.type = "button";
  resetButton.disabled = true;
  resetButton.title = t("popupResetShortcut");
  resetButton.setAttribute("data-reset-shortcut", key);
  const icon = document.createElement("img");
  icon.src = chrome.runtime.getURL("assets/reload-icon.svg");
  icon.alt = "";
  resetButton.append(icon);
  resetButton.addEventListener("click", () => {
    const shortcut = { ...util.SHORTCUT_DEFAULTS[key] };
    const conflict = findConflict(shortcut, key);
    if (conflict) {
      showStatus(t("popupShortcutConflict", conflict), true);
      return;
    }
    void saveShortcut(key, shortcut);
  });
  actions.append(resetButton);
  resetShortcutButtons.set(key, resetButton);
}

function renderShortcutActionButtons() {
  for (const [key, button] of resetShortcutButtons) {
    const shortcut = shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key];
    const name = shortcutName(key);
    const resetLabel = t("popupResetShortcut");
    button.title = resetLabel;
    button.setAttribute("aria-label", `${resetLabel}: ${name}`);
    button.hidden = sameShortcut(shortcut, util.SHORTCUT_DEFAULTS[key]);

    const clearButton = clearShortcutButtons.get(key);
    if (clearButton) {
      const clearLabel = t("popupClearShortcut");
      clearButton.title = clearLabel;
      clearButton.setAttribute("aria-label", `${clearLabel}: ${name}`);
      clearButton.hidden = shortcut.code === "";
    }
  }
}

renderShortcutActionButtons();

function findConflict(shortcut: Shortcut, self: ShortcutKey) {
  if (shortcut.code === "") return null;
  const other = util.SHORTCUT_KEYS.find(
    (key) =>
      key !== self &&
      sameShortcut(shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key], shortcut),
  );
  return other ? shortcutName(other) : null;
}

async function saveShortcut(key: ShortcutKey, shortcut: Shortcut) {
  const conflict = findConflict(shortcut, key);
  if (conflict) {
    recordingKey = key;
    renderShortcuts();
    showStatus(t("popupShortcutConflict", conflict), true);
    return;
  }

  recordingKey = null;
  renderShortcut(key);
  try {
    await chrome.storage.local.set({ [key]: shortcut });
    shortcuts.set(key, shortcut);
    renderShortcut(key);
    renderShortcutActionButtons();
    showStatus("");
  } catch {
    showStatus(t("popupCannotSaveShortcut"), true);
  }
}

for (const key of util.SHORTCUT_KEYS) {
  shortcutButtons.get(key)?.addEventListener("click", () => {
    recordingKey = key;
    renderShortcuts();
  });
}

document.addEventListener(
  "keydown",
  async (e) => {
    if (!recordingKey) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      recordingKey = null;
      renderShortcuts();
      showStatus("");
      return;
    }
    if (recordingKey === "pipResizeShortcut") {
      showStatus(t("popupResizeNeedsModifier"), true);
      return;
    }

    const isMetaKey =
      e.key === "Meta" ||
      e.key === "OS" ||
      e.code === "MetaLeft" ||
      e.code === "MetaRight";
    if (
      navigator.platform.includes("Win") &&
      (util.hasMetaModifier(e) || isMetaKey)
    ) {
      showStatus(t("popupWinKeyUnsupported"), true);
      return;
    }

    if (["Control", "Alt", "Shift"].includes(e.key)) return;
    if (isMetaKey) {
      const modifierName = navigator.platform.includes("Mac")
        ? "Command"
        : "Meta";
      showStatus(t("popupModifierKey", modifierName));
      return;
    }

    if (e.code === "Unidentified") {
      showStatus(t("popupUnrecognizedKey"), true);
      return;
    }

    const isNavigationKey = [
      "Tab",
      "Enter",
      "Backspace",
      "Delete",
      "CapsLock",
    ].includes(e.key);
    const allowedEnter =
      e.key === "Enter" && recordingKey === "pipDanmakuInputShortcut";
    if (
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.shiftKey &&
      isNavigationKey &&
      !allowedEnter
    ) {
      showStatus(t("popupNavigationKey"), true);
      return;
    }

    const key = recordingKey;
    void saveShortcut(key, {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: util.hasMetaModifier(e),
    });
  },
  true,
);

document.addEventListener(
  "wheel",
  (e) => {
    if (recordingKey !== "pipResizeShortcut") return;
    e.preventDefault();
    e.stopPropagation();
    const meta = e.metaKey || e.getModifierState("Meta");
    if (navigator.platform.includes("Win") && meta) {
      showStatus(t("popupWinKeyUnsupported"), true);
      return;
    }
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !meta) {
      showStatus(t("popupResizeNeedsModifier"), true);
      return;
    }
    void saveShortcut(recordingKey, {
      code: "Wheel",
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta,
    });
  },
  { capture: true, passive: false },
);

// 快進快退秒數
function setSeekSeconds(value: unknown) {
  seekSecondsSelect.value = String(util.normalizeSeekSeconds(value));
}

async function loadSeekSeconds() {
  seekSecondsSelect.disabled = true;
  try {
    const stored = await chrome.storage.local.get({
      seekSeconds: util.DEFAULT_SEEK_SECONDS,
    });
    setSeekSeconds(stored.seekSeconds);
  } catch {
    setSeekSeconds(util.DEFAULT_SEEK_SECONDS);
  } finally {
    seekSecondsSelect.disabled = false;
  }
}

async function saveSeekSeconds() {
  const seekSeconds = util.normalizeSeekSeconds(
    Number(seekSecondsSelect.value),
  );
  try {
    await chrome.storage.local.set({ seekSeconds });
    showStatus("");
  } catch {
    showStatus(t("popupCannotSaveSeek"), true);
    await loadSeekSeconds();
  }
}

seekSecondsSelect.addEventListener("change", () => {
  void saveSeekSeconds();
});

// 功能開關
const danmakuToggle = document.querySelector(
  "#danmaku-toggle",
) as HTMLInputElement;
const commentsToggle = document.querySelector(
  "#comments-toggle",
) as HTMLInputElement;
const screenshotToggle = document.querySelector(
  "#screenshot-toggle",
) as HTMLInputElement;
const followPlaybackPipToggle = document.querySelector(
  "#follow-playback-pip-toggle",
) as HTMLInputElement;
const thumbnailPreviewToggle = document.querySelector(
  "#thumbnail-preview-toggle",
) as HTMLInputElement;

async function saveToggle(
  toggle: HTMLInputElement,
  key:
    | "danmakuEnabled"
    | "commentsEnabled"
    | "screenshotEnabled"
    | "followPlaybackPip"
    | "thumbnailPreviewEnabled",
) {
  try {
    await chrome.storage.local.set({ [key]: toggle.checked });
  } catch {
    showStatus(t("popupCannotSaveToggle"), true);
    try {
      const stored = await chrome.storage.local.get(key);
      toggle.checked = stored[key] !== false;
    } catch {
      // 無法讀取
    }
  }
}

async function loadToggles() {
  try {
    const stored = await chrome.storage.local.get({
      danmakuEnabled: true,
      commentsEnabled: true,
      screenshotEnabled: true,
      followPlaybackPip: false,
      thumbnailPreviewEnabled: true,
    });
    danmakuToggle.checked = stored.danmakuEnabled !== false;
    commentsToggle.checked = stored.commentsEnabled !== false;
    screenshotToggle.checked = stored.screenshotEnabled !== false;
    followPlaybackPipToggle.checked = stored.followPlaybackPip === true;
    thumbnailPreviewToggle.checked = stored.thumbnailPreviewEnabled !== false;
  } catch {
    danmakuToggle.checked = true;
    commentsToggle.checked = true;
    screenshotToggle.checked = true;
    followPlaybackPipToggle.checked = false;
    thumbnailPreviewToggle.checked = true;
  } finally {
    danmakuToggle.disabled = false;
    commentsToggle.disabled = false;
    screenshotToggle.disabled = false;
    followPlaybackPipToggle.disabled = false;
    thumbnailPreviewToggle.disabled = false;
  }
}

danmakuToggle.addEventListener("change", () => {
  void saveToggle(danmakuToggle, "danmakuEnabled");
});
commentsToggle.addEventListener("change", () => {
  void saveToggle(commentsToggle, "commentsEnabled");
});
screenshotToggle.addEventListener("change", () => {
  void saveToggle(screenshotToggle, "screenshotEnabled");
});
followPlaybackPipToggle.addEventListener("change", () => {
  void saveToggle(followPlaybackPipToggle, "followPlaybackPip");
});
thumbnailPreviewToggle.addEventListener("change", () => {
  void saveToggle(thumbnailPreviewToggle, "thumbnailPreviewEnabled");
});

// 彈幕設定
const danmakuFontFamily = document.querySelector(
  "#danmaku-font-family",
) as HTMLSelectElement;
const danmakuStyleControls = [
  {
    key: "fontSizeScale",
    input: document.querySelector("#danmaku-size") as HTMLInputElement,
    output: document.querySelector("#danmaku-size-value") as HTMLOutputElement,
  },
  {
    key: "maxFontSize",
    input: document.querySelector("#danmaku-max-size") as HTMLInputElement,
    output: document.querySelector(
      "#danmaku-max-size-value",
    ) as HTMLOutputElement,
  },
  {
    key: "opacity",
    input: document.querySelector("#danmaku-opacity") as HTMLInputElement,
    output: document.querySelector(
      "#danmaku-opacity-value",
    ) as HTMLOutputElement,
  },
  {
    key: "speedScale",
    input: document.querySelector("#danmaku-speed") as HTMLInputElement,
    output: document.querySelector("#danmaku-speed-value") as HTMLOutputElement,
  },
  {
    key: "fontWeight",
    input: document.querySelector("#danmaku-weight") as HTMLInputElement,
    output: document.querySelector(
      "#danmaku-weight-value",
    ) as HTMLOutputElement,
  },
  {
    key: "displayArea",
    input: document.querySelector("#danmaku-area") as HTMLInputElement,
    output: document.querySelector("#danmaku-area-value") as HTMLOutputElement,
  },
] as const;
const danmakuStyleReset = document.querySelector(
  "#danmaku-style-reset",
) as HTMLButtonElement;

let popupDanmakuStyle = { ...danmakuSettings.DEFAULTS };
let popupDanmakuStyleRevision = 0;
let popupDanmakuStyleDirty = false;
let danmakuStyleSaveQueue: Promise<void> = Promise.resolve();
let danmakuStyleSaveTimer: ReturnType<typeof setTimeout> | undefined;

function setDanmakuStyleControlsDisabled(disabled: boolean) {
  danmakuFontFamily.disabled = disabled;
  for (const control of danmakuStyleControls) control.input.disabled = disabled;
  danmakuStyleReset.disabled = disabled;
}

function renderDanmakuStyle() {
  for (const control of danmakuStyleControls) {
    const value = popupDanmakuStyle[control.key];
    const speedIndex = danmakuSettings.SPEED_OPTIONS.findIndex(
      ({ value: speed }) => speed === value,
    );
    const label =
      control.key === "speedScale"
        ? (danmakuSettings.SPEED_OPTIONS[speedIndex]?.label ?? "")
        : control.key === "fontWeight"
          ? String(value)
          : control.key === "maxFontSize"
            ? `${value}px`
            : `${value}%`;
    control.input.value =
      control.key === "speedScale" ? String(speedIndex) : String(value);
    control.output.value = label;
    if (control.key === "speedScale")
      control.input.setAttribute("aria-valuetext", label);
  }
  danmakuFontFamily.value = popupDanmakuStyle.fontFamily;
}

function updateDanmakuStyle(value: unknown) {
  popupDanmakuStyle = danmakuSettings.normalize(value);
  popupDanmakuStyleRevision++;
  popupDanmakuStyleDirty = true;
  renderDanmakuStyle();
}

async function saveDanmakuStyle() {
  const style = { ...popupDanmakuStyle };
  const revision = popupDanmakuStyleRevision;
  const save = danmakuStyleSaveQueue.then(() =>
    chrome.storage.local.set({
      [danmakuSettings.STORAGE_KEY]: style,
    }),
  );
  danmakuStyleSaveQueue = save.catch(() => {});
  try {
    await save;
    if (revision === popupDanmakuStyleRevision) popupDanmakuStyleDirty = false;
    showStatus("");
  } catch {
    showStatus(t("popupCannotSaveDanmaku"), true);
  }
}

function scheduleDanmakuStyleSave() {
  if (danmakuStyleSaveTimer) clearTimeout(danmakuStyleSaveTimer);
  danmakuStyleSaveTimer = setTimeout(() => {
    danmakuStyleSaveTimer = undefined;
    void saveDanmakuStyle();
  }, 120);
}

async function loadDanmakuStyle() {
  const revision = popupDanmakuStyleRevision;
  let style: typeof popupDanmakuStyle;
  try {
    const stored = await chrome.storage.local.get(danmakuSettings.STORAGE_KEY);
    style = danmakuSettings.normalize(stored[danmakuSettings.STORAGE_KEY]);
  } catch {
    style = { ...danmakuSettings.DEFAULTS };
  }
  if (revision === popupDanmakuStyleRevision) {
    popupDanmakuStyle = style;
    renderDanmakuStyle();
  }
  setDanmakuStyleControlsDisabled(false);
}

danmakuFontFamily.addEventListener("change", () => {
  updateDanmakuStyle({
    ...popupDanmakuStyle,
    fontFamily: danmakuFontFamily.value,
  });
  void saveDanmakuStyle();
});

function getDanmakuStyleControlValue(
  control: (typeof danmakuStyleControls)[number],
) {
  const value = Number(control.input.value);
  return control.key === "speedScale"
    ? danmakuSettings.SPEED_OPTIONS[value]?.value
    : value;
}

for (const control of danmakuStyleControls) {
  control.input.addEventListener("input", () => {
    updateDanmakuStyle({
      ...popupDanmakuStyle,
      [control.key]: getDanmakuStyleControlValue(control),
    });
    scheduleDanmakuStyleSave();
  });
  control.input.addEventListener("change", () => {
    if (danmakuStyleSaveTimer) clearTimeout(danmakuStyleSaveTimer);
    danmakuStyleSaveTimer = undefined;
    void saveDanmakuStyle();
  });
}

danmakuStyleReset.addEventListener("click", () => {
  updateDanmakuStyle(danmakuSettings.DEFAULTS);
  void saveDanmakuStyle();
});

// 字幕設定
const subtitleFontFamily = document.querySelector(
  "#subtitle-font-family",
) as HTMLSelectElement;
const subtitleTextColor = document.querySelector(
  "#subtitle-text-color",
) as HTMLInputElement;
const subtitleBackgroundColor = document.querySelector(
  "#subtitle-background-color",
) as HTMLInputElement;
const subtitleBackgroundOpacity = document.querySelector(
  "#subtitle-background-opacity",
) as HTMLInputElement;
const subtitleBackgroundOpacityValue = document.querySelector(
  "#subtitle-background-opacity-value",
) as HTMLOutputElement;
const subtitleEdgeStyle = document.querySelector(
  "#subtitle-edge-style",
) as HTMLSelectElement;
const subtitleEdgeColor = document.querySelector(
  "#subtitle-edge-color",
) as HTMLInputElement;
const subtitleOutlineWidthRow = document.querySelector(
  "#subtitle-edge-intensity-row",
) as HTMLElement;
const subtitlePosition = document.querySelector(
  "#subtitle-position",
) as HTMLInputElement;
const subtitlePositionValue = document.querySelector(
  "#subtitle-position-value",
) as HTMLOutputElement;
const subtitlePreview = document.querySelector(
  "#subtitle-preview",
) as HTMLElement;
const subtitlePreviewPrimary = document.querySelector(
  "#subtitle-preview-primary",
) as HTMLElement;
const subtitlePreviewSecondary = document.querySelector(
  "#subtitle-preview-secondary",
) as HTMLElement;
const subtitlePairGap = document.querySelector(
  "#subtitle-pair-gap",
) as HTMLInputElement;
const subtitlePairGapValue = document.querySelector(
  "#subtitle-pair-gap-value",
) as HTMLOutputElement;
const subtitleLetterSpacing = document.querySelector(
  "#subtitle-letter-spacing",
) as HTMLInputElement;
const subtitleLetterSpacingValue = document.querySelector(
  "#subtitle-letter-spacing-value",
) as HTMLOutputElement;

const subtitleStyleTargets = ["primary", "secondary"] as const;
type SubtitleStyleTarget = (typeof subtitleStyleTargets)[number];
const subtitleStyleStorageKeys: Record<SubtitleStyleTarget, string> = {
  primary: subtitleSettings.STORAGE_KEY,
  secondary: subtitleSettings.SECONDARY_STORAGE_KEY,
};
const subtitleStyleDefaults: Record<
  SubtitleStyleTarget,
  SubtitleStyleSettings
> = {
  primary: subtitleSettings.DEFAULTS,
  secondary: subtitleSettings.SECONDARY_DEFAULTS,
};
const subtitleStyleButtons: Record<SubtitleStyleTarget, HTMLButtonElement> = {
  primary: document.querySelector(
    "#subtitle-style-primary",
  ) as HTMLButtonElement,
  secondary: document.querySelector(
    "#subtitle-style-secondary",
  ) as HTMLButtonElement,
};

const subtitleStyleControls = [
  {
    key: "fontWeight",
    input: document.querySelector("#subtitle-font-weight") as HTMLInputElement,
    output: document.querySelector(
      "#subtitle-font-weight-value",
    ) as HTMLOutputElement,
  },
  {
    key: "lineHeightScale",
    input: document.querySelector("#subtitle-line-height") as HTMLInputElement,
    output: document.querySelector(
      "#subtitle-line-height-value",
    ) as HTMLOutputElement,
  },
  {
    key: "fontSizeScale",
    input: document.querySelector("#subtitle-size") as HTMLInputElement,
    output: document.querySelector("#subtitle-size-value") as HTMLOutputElement,
  },
  {
    key: "edgeIntensity",
    input: document.querySelector(
      "#subtitle-edge-intensity",
    ) as HTMLInputElement,
    output: document.querySelector(
      "#subtitle-edge-intensity-value",
    ) as HTMLOutputElement,
  },
] as const;
const subtitleStyleReset = document.querySelector(
  "#subtitle-style-reset",
) as HTMLButtonElement;
const subtitleLayoutReset = document.querySelector(
  "#subtitle-layout-reset",
) as HTMLButtonElement;

let activeSubtitleStyleTarget: SubtitleStyleTarget = "primary";
let subtitleStyleControlsLoaded = false;
let subtitleLayoutLoaded = false;
const popupSubtitleStyles: Record<SubtitleStyleTarget, SubtitleStyleSettings> =
  {
    primary: { ...subtitleSettings.DEFAULTS },
    secondary: { ...subtitleSettings.SECONDARY_DEFAULTS },
  };
const subtitleStyleRevisions: Record<SubtitleStyleTarget, number> = {
  primary: 0,
  secondary: 0,
};
const subtitleStyleDirty: Record<SubtitleStyleTarget, boolean> = {
  primary: false,
  secondary: false,
};
const subtitleStyleSaveQueues: Record<SubtitleStyleTarget, Promise<void>> = {
  primary: Promise.resolve(),
  secondary: Promise.resolve(),
};
const subtitleStyleSaveTimers: Record<
  SubtitleStyleTarget,
  ReturnType<typeof setTimeout> | undefined
> = { primary: undefined, secondary: undefined };
let subtitleLayout = { ...subtitleSettings.LAYOUT_DEFAULTS };
let subtitleLayoutRevision = 0;
let subtitleLayoutDirty = false;
let subtitleLayoutSaveQueue: Promise<void> = Promise.resolve();
let subtitleLayoutSaveTimer: ReturnType<typeof setTimeout> | undefined;

function setSubtitleStyleControlsDisabled() {
  const styleDisabled = !subtitleStyleControlsLoaded;
  const layoutDisabled = !subtitleLayoutLoaded;
  subtitleFontFamily.disabled = styleDisabled;
  subtitleTextColor.disabled = styleDisabled;
  subtitleEdgeStyle.disabled = styleDisabled;
  subtitleEdgeColor.disabled = styleDisabled;
  subtitleBackgroundColor.disabled = layoutDisabled;
  subtitleBackgroundOpacity.disabled = layoutDisabled;
  subtitlePairGap.disabled = layoutDisabled;
  subtitleLetterSpacing.disabled = layoutDisabled;
  subtitlePosition.disabled = layoutDisabled;
  subtitleLayoutReset.disabled = layoutDisabled;
  for (const control of subtitleStyleControls)
    control.input.disabled = styleDisabled;
  subtitleStyleReset.disabled = styleDisabled;
  for (const button of Object.values(subtitleStyleButtons))
    button.disabled = styleDisabled;
}

function renderSubtitleStyle() {
  const style = popupSubtitleStyles[activeSubtitleStyleTarget];
  for (const control of subtitleStyleControls) {
    const value = style[control.key];
    control.input.value = String(value);
    control.output.value =
      control.key === "edgeIntensity"
        ? String(value)
        : control.key === "fontWeight"
          ? String(value)
          : `${value}%`;
  }
  subtitleFontFamily.value = style.fontFamily;
  subtitleTextColor.value = style.textColor;
  subtitleEdgeStyle.value = style.edgeStyle;
  subtitleEdgeColor.value = style.edgeColor;
  subtitleEdgeColor.disabled =
    !subtitleStyleControlsLoaded || style.edgeStyle === "none";
  const edgeEnabled = style.edgeStyle !== "none";
  const outlineControl = subtitleStyleControls.find(
    (control) => control.key === "edgeIntensity",
  );
  if (outlineControl)
    outlineControl.input.disabled =
      !subtitleStyleControlsLoaded || !edgeEnabled;
  subtitleOutlineWidthRow.hidden = !edgeEnabled;
  for (const target of subtitleStyleTargets)
    subtitleStyleButtons[target].setAttribute(
      "aria-pressed",
      String(target === activeSubtitleStyleTarget),
    );
  subtitleSettings.apply(subtitlePreview, popupSubtitleStyles.primary);
  subtitleSettings.apply(subtitlePreviewPrimary, popupSubtitleStyles.primary);
  subtitleSettings.apply(
    subtitlePreviewSecondary,
    popupSubtitleStyles.secondary,
  );
  subtitlePairGap.value = String(subtitleLayout.pairGap);
  subtitlePairGapValue.value = `${(subtitleLayout.pairGap / 100).toFixed(2)}em`;
  subtitleLetterSpacing.value = String(subtitleLayout.letterSpacing);
  subtitleLetterSpacingValue.value = `${(subtitleLayout.letterSpacing / 100).toFixed(2)}em`;
  subtitleBackgroundColor.value = subtitleLayout.backgroundColor;
  subtitleBackgroundOpacity.value = String(subtitleLayout.backgroundOpacity);
  subtitleBackgroundOpacityValue.value = `${subtitleLayout.backgroundOpacity}%`;
  subtitlePosition.value = String(subtitleLayout.bottomOffset);
  subtitlePositionValue.value = `${subtitleLayout.bottomOffset}%`;
  subtitleSettings.applyLayout(subtitlePreview, subtitleLayout);
}

function updateSubtitleStyle(target: SubtitleStyleTarget, value: unknown) {
  popupSubtitleStyles[target] = subtitleSettings.normalize(
    value,
    subtitleStyleDefaults[target],
  );
  subtitleStyleRevisions[target]++;
  subtitleStyleDirty[target] = true;
  renderSubtitleStyle();
}

async function saveSubtitleStyle(target: SubtitleStyleTarget) {
  const style = { ...popupSubtitleStyles[target] };
  const revision = subtitleStyleRevisions[target];
  const save = subtitleStyleSaveQueues[target].then(() =>
    chrome.storage.local.set({
      [subtitleStyleStorageKeys[target]]: style,
    }),
  );
  subtitleStyleSaveQueues[target] = save.catch(() => {});
  try {
    await save;
    if (revision === subtitleStyleRevisions[target])
      subtitleStyleDirty[target] = false;
    showStatus("");
  } catch {
    showStatus(t("popupCannotSaveSubtitle"), true);
  }
}

function scheduleSubtitleStyleSave(target: SubtitleStyleTarget) {
  const previousTimer = subtitleStyleSaveTimers[target];
  if (previousTimer) clearTimeout(previousTimer);
  subtitleStyleSaveTimers[target] = setTimeout(() => {
    subtitleStyleSaveTimers[target] = undefined;
    void saveSubtitleStyle(target);
  }, 120);
}

function saveSubtitleStyleImmediately(target: SubtitleStyleTarget) {
  const timer = subtitleStyleSaveTimers[target];
  if (timer) clearTimeout(timer);
  subtitleStyleSaveTimers[target] = undefined;
  void saveSubtitleStyle(target);
}

function updateSubtitleLayout(value: unknown) {
  subtitleLayout = subtitleSettings.normalizeLayout(value);
  subtitleLayoutRevision++;
  subtitleLayoutDirty = true;
  renderSubtitleStyle();
}

async function saveSubtitleLayout() {
  const layout = { ...subtitleLayout };
  const revision = subtitleLayoutRevision;
  const save = subtitleLayoutSaveQueue.then(() =>
    chrome.storage.local.set({
      [subtitleSettings.LAYOUT_STORAGE_KEY]: layout,
    }),
  );
  subtitleLayoutSaveQueue = save.catch(() => {});
  try {
    await save;
    if (revision === subtitleLayoutRevision) subtitleLayoutDirty = false;
    showStatus("");
  } catch {
    showStatus(t("popupCannotSaveSubtitle"), true);
  }
}

function scheduleSubtitleLayoutSave() {
  if (subtitleLayoutSaveTimer) clearTimeout(subtitleLayoutSaveTimer);
  subtitleLayoutSaveTimer = setTimeout(() => {
    subtitleLayoutSaveTimer = undefined;
    void saveSubtitleLayout();
  }, 120);
}

async function loadSubtitleLayout() {
  const revision = subtitleLayoutRevision;
  try {
    const stored = await chrome.storage.local.get(
      subtitleSettings.LAYOUT_STORAGE_KEY,
    );
    if (revision === subtitleLayoutRevision)
      subtitleLayout = subtitleSettings.normalizeLayout(
        stored[subtitleSettings.LAYOUT_STORAGE_KEY],
      );
  } catch {
    if (revision === subtitleLayoutRevision)
      subtitleLayout = { ...subtitleSettings.LAYOUT_DEFAULTS };
  }
  subtitleLayoutLoaded = true;
  setSubtitleStyleControlsDisabled();
  renderSubtitleStyle();
}

async function loadSubtitleStyles() {
  const revisions = { ...subtitleStyleRevisions };
  try {
    const stored = await chrome.storage.local.get({
      [subtitleSettings.STORAGE_KEY]: subtitleSettings.DEFAULTS,
      [subtitleSettings.SECONDARY_STORAGE_KEY]:
        subtitleSettings.SECONDARY_DEFAULTS,
    });
    for (const target of subtitleStyleTargets) {
      if (revisions[target] === subtitleStyleRevisions[target]) {
        const scrubbed = subtitleSettings.scrubOrphanedStyleFields(
          stored[subtitleStyleStorageKeys[target]],
          subtitleSettings.normalize(
            stored[subtitleStyleStorageKeys[target]],
            subtitleStyleDefaults[target],
          ),
        );
        popupSubtitleStyles[target] = scrubbed.style;
        if (scrubbed.changed)
          void chrome.storage.local.set({
            [subtitleStyleStorageKeys[target]]: scrubbed.style,
          });
      }
    }
  } catch {
    for (const target of subtitleStyleTargets) {
      if (revisions[target] === subtitleStyleRevisions[target])
        popupSubtitleStyles[target] = {
          ...subtitleStyleDefaults[target],
        };
    }
  }
  subtitleStyleControlsLoaded = true;
  setSubtitleStyleControlsDisabled();
  renderSubtitleStyle();
}

for (const control of subtitleStyleControls) {
  control.input.addEventListener("input", () => {
    const target = activeSubtitleStyleTarget;
    updateSubtitleStyle(target, {
      ...popupSubtitleStyles[target],
      [control.key]: Number(control.input.value),
    });
    scheduleSubtitleStyleSave(target);
  });
  control.input.addEventListener("change", () =>
    saveSubtitleStyleImmediately(activeSubtitleStyleTarget),
  );
}

for (const [input, key] of [
  [subtitleBackgroundColor, "backgroundColor"],
  [subtitleBackgroundOpacity, "backgroundOpacity"],
  [subtitlePairGap, "pairGap"],
  [subtitleLetterSpacing, "letterSpacing"],
  [subtitlePosition, "bottomOffset"],
] as const) {
  input.addEventListener("input", () => {
    updateSubtitleLayout({
      ...subtitleLayout,
      [key]: key === "backgroundColor" ? input.value : Number(input.value),
    });
    scheduleSubtitleLayoutSave();
  });
  input.addEventListener("change", () => {
    if (subtitleLayoutSaveTimer) clearTimeout(subtitleLayoutSaveTimer);
    subtitleLayoutSaveTimer = undefined;
    void saveSubtitleLayout();
  });
}

for (const target of subtitleStyleTargets)
  subtitleStyleButtons[target].addEventListener("click", () => {
    activeSubtitleStyleTarget = target;
    renderSubtitleStyle();
  });

subtitleFontFamily.addEventListener("change", () => {
  const target = activeSubtitleStyleTarget;
  updateSubtitleStyle(target, {
    ...popupSubtitleStyles[target],
    fontFamily: subtitleFontFamily.value,
  });
  void saveSubtitleStyle(target);
});
subtitleEdgeStyle.addEventListener("change", () => {
  const target = activeSubtitleStyleTarget;
  updateSubtitleStyle(target, {
    ...popupSubtitleStyles[target],
    edgeStyle: subtitleEdgeStyle.value,
  });
  void saveSubtitleStyle(target);
});
for (const [input, key] of [
  [subtitleTextColor, "textColor"],
  [subtitleEdgeColor, "edgeColor"],
] as const) {
  input.addEventListener("input", () => {
    const target = activeSubtitleStyleTarget;
    updateSubtitleStyle(target, {
      ...popupSubtitleStyles[target],
      [key]: input.value,
    });
    scheduleSubtitleStyleSave(target);
  });
  input.addEventListener("change", () =>
    saveSubtitleStyleImmediately(activeSubtitleStyleTarget),
  );
}
subtitleStyleReset.addEventListener("click", () => {
  const target = activeSubtitleStyleTarget;
  updateSubtitleStyle(target, subtitleStyleDefaults[target]);
  void saveSubtitleStyle(target);
});
subtitleLayoutReset.addEventListener("click", () => {
  updateSubtitleLayout({ ...subtitleSettings.LAYOUT_DEFAULTS });
  void saveSubtitleLayout();
});

// 監聽其他頁面存入的 storage 變化
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.uiLanguage) {
    util.setLanguagePreference(changes.uiLanguage.newValue);
    languageSelect.value = util.getLocale();
    refreshOptionsLocale();
  }
  if (changes.seekSeconds) setSeekSeconds(changes.seekSeconds.newValue);
  if (changes.danmakuEnabled)
    danmakuToggle.checked = changes.danmakuEnabled.newValue !== false;
  if (changes.commentsEnabled)
    commentsToggle.checked = changes.commentsEnabled.newValue !== false;
  if (changes.screenshotEnabled)
    screenshotToggle.checked = changes.screenshotEnabled.newValue !== false;
  if (changes.followPlaybackPip)
    followPlaybackPipToggle.checked =
      changes.followPlaybackPip.newValue === true;
  if (changes.thumbnailPreviewEnabled)
    thumbnailPreviewToggle.checked =
      changes.thumbnailPreviewEnabled.newValue !== false;

  for (const key of util.SHORTCUT_KEYS) {
    if (changes[key]) {
      shortcuts.set(
        key,
        util.normalizeShortcut(
          changes[key].newValue,
          util.SHORTCUT_DEFAULTS[key],
        ),
      );
      renderShortcut(key);
    }
  }
  renderShortcutActionButtons();

  const danmakuChange = changes[danmakuSettings.STORAGE_KEY];
  if (danmakuChange && !popupDanmakuStyleDirty) {
    popupDanmakuStyle = danmakuSettings.normalize(danmakuChange.newValue);
    popupDanmakuStyleRevision++;
    renderDanmakuStyle();
  }

  const translationConfigChange =
    changes[subtitleTranslationSettings.CONFIG_KEY];
  if (translationConfigChange) {
    subtitleTranslationConfig = normalizeSubtitleTranslationConfig(
      translationConfigChange.newValue,
    );
    microsoftTranslationRegion.value =
      subtitleTranslationConfig.microsoftRegion;
    renderSubtitleTranslationConfig();
  }

  for (const target of subtitleStyleTargets) {
    const subtitleChange = changes[subtitleStyleStorageKeys[target]];
    if (subtitleChange && !subtitleStyleDirty[target]) {
      popupSubtitleStyles[target] = subtitleSettings.normalize(
        subtitleChange.newValue,
        subtitleStyleDefaults[target],
      );
      subtitleStyleRevisions[target]++;
      renderSubtitleStyle();
    }
  }
  const subtitleLayoutChange = changes[subtitleSettings.LAYOUT_STORAGE_KEY];
  if (subtitleLayoutChange && !subtitleLayoutDirty) {
    subtitleLayout = subtitleSettings.normalizeLayout(
      subtitleLayoutChange.newValue,
    );
    subtitleLayoutRevision++;
    renderSubtitleStyle();
  }
});

// 導覽列平滑捲動與 active 高亮
const navItems = document.querySelectorAll<HTMLAnchorElement>(".nav-item");
const sections = document.querySelectorAll<HTMLElement>(".settings-card");

window.addEventListener("scroll", () => {
  let currentId = "";
  const scrollPosition = window.scrollY + 100;
  for (const section of sections) {
    if (section.offsetTop <= scrollPosition) currentId = section.id;
  }
  for (const item of navItems) {
    item.classList.toggle(
      "active",
      item.getAttribute("href") === `#${currentId}`,
    );
  }
});

setDanmakuStyleControlsDisabled(true);
setSubtitleStyleControlsDisabled();
renderDanmakuStyle();
renderSubtitleStyle();
void loadShortcuts();
void loadToggles();
void loadSeekSeconds();
void loadDanmakuStyle();
void loadSubtitleStyles();
void loadSubtitleLayout();
void loadSubtitleTranslationConfig();
