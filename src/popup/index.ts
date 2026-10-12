"use strict";
export {};

const util = globalThis.PipCompanion.util;
const { uiLanguage } = await chrome.storage.local.get("uiLanguage");
util.setLanguagePreference(uiLanguage);
const popupDanmakuSettings = globalThis.PipCompanion.danmakuSettings;
const popupCaptionSettings = globalThis.PipCompanion.captionSettings;
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

const openButton = document.querySelector("#open-pip") as HTMLButtonElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const pipResizeShortcut = document.querySelector(
  "#pip-resize-shortcut",
) as HTMLElement;
pipResizeShortcut.textContent = navigator.platform.includes("Mac")
  ? `⌘ + ${t("popupWheel")}`
  : `Ctrl + ${t("popupWheel")}`;
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
    refreshPopupLocale();
  } catch {
    util.setLanguagePreference(previousLanguage);
    languageSelect.value = util.getLocale();
    refreshPopupLocale();
    showStatus(t("popupLanguageSaveFailed"), true);
  }
});
for (const seconds of util.SEEK_SECONDS_OPTIONS) {
  const option = document.createElement("option");
  option.value = String(seconds);
  option.textContent = t("popupSeconds", String(seconds));
  seekSecondsSelect.append(option);
}
const menuView = document.querySelector("#menu-view") as HTMLElement;
const danmakuSettingsView = document.querySelector(
  "#danmaku-settings-view",
) as HTMLElement;
const danmakuSettingsOpen = document.querySelector(
  "#danmaku-settings-open",
) as HTMLButtonElement;
const danmakuSettingsBack = document.querySelector(
  "#danmaku-settings-back",
) as HTMLButtonElement;
const captionSettingsView = document.querySelector(
  "#caption-settings-view",
) as HTMLElement;
const captionSettingsOpen = document.querySelector(
  "#caption-settings-open",
) as HTMLButtonElement;
const captionSettingsBack = document.querySelector(
  "#caption-settings-back",
) as HTMLButtonElement;
let activeSettingsView: "danmaku" | "caption" = "danmaku";

function setSettingsView(view: "menu" | "danmaku" | "caption") {
  menuView.hidden = view !== "menu";
  danmakuSettingsView.hidden = view !== "danmaku";
  captionSettingsView.hidden = view !== "caption";
  if (view !== "menu") activeSettingsView = view;
  const focusTarget =
    view === "menu"
      ? activeSettingsView === "danmaku"
        ? danmakuSettingsOpen
        : captionSettingsOpen
      : view === "danmaku"
        ? danmakuSettingsBack
        : captionSettingsBack;
  focusTarget.focus();
}

danmakuSettingsOpen.addEventListener("click", () => setSettingsView("danmaku"));
danmakuSettingsBack.addEventListener("click", () => setSettingsView("menu"));
captionSettingsOpen.addEventListener("click", () => setSettingsView("caption"));
captionSettingsBack.addEventListener("click", () => setSettingsView("menu"));

let pipOpen = false;
let pipStateSyncPending = false;

function setPipOpen(open: boolean) {
  pipOpen = open;
  openButton.textContent = open ? t("popupClosePip") : t("popupOpenPip");
}

function refreshPopupLocale() {
  refreshLocalizedMarkup();
  pipResizeShortcut.textContent = navigator.platform.includes("Mac")
    ? `⌘ + ${t("popupWheel")}`
    : `Ctrl + ${t("popupWheel")}`;
  for (const option of seekSecondsSelect.options)
    option.textContent = t("popupSeconds", option.value);
  setPipOpen(pipOpen);
  renderShortcuts();
  renderDanmakuStyle();
  showStatus("");
}

async function syncPipState() {
  if (pipStateSyncPending) return;
  pipStateSyncPending = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_PIP_STATE",
    } satisfies ExtensionMessage);
    setPipOpen(response?.pipOpen === true);
  } catch {
    // 背景指令碼尚未回應時，維持目前狀態。
  } finally {
    pipStateSyncPending = false;
  }
}

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    globalThis.PipCompanion.util.isExtensionMessage(message) &&
    message.type === "PIP_GLOBAL_STATE"
  )
    setPipOpen(message.pipOpen);
});

const danmakuToggle = document.querySelector(
  "#danmaku-toggle",
) as HTMLInputElement;
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
let popupDanmakuStyle = { ...popupDanmakuSettings.DEFAULTS };
let popupDanmakuStyleRevision = 0;
let popupDanmakuStyleDirty = false;
let danmakuStyleSaveQueue: Promise<void> = Promise.resolve();
let danmakuStyleSaveTimer: ReturnType<typeof setTimeout> | undefined;
const commentsToggle = document.querySelector(
  "#comments-toggle",
) as HTMLInputElement;
const screenshotToggle = document.querySelector(
  "#screenshot-toggle",
) as HTMLInputElement;
const followPlaybackPipToggle = document.querySelector(
  "#follow-playback-pip-toggle",
) as HTMLInputElement;
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

function showStatus(message: string, error = false) {
  statusEl.textContent = message;
  statusEl.dataset.error = String(error);
}

async function saveToggle(
  toggle: HTMLInputElement,
  key:
    | "danmakuEnabled"
    | "commentsEnabled"
    | "screenshotEnabled"
    | "followPlaybackPip",
  onRestore?: () => void,
) {
  try {
    await chrome.storage.local.set({ [key]: toggle.checked });
  } catch {
    showStatus(t("popupCannotSaveToggle"), true);
    try {
      const stored = await chrome.storage.local.get(key);
      toggle.checked = stored[key] !== false;
      onRestore?.();
    } catch {
      // 無法讀取已儲存狀態時，保留目前值並顯示錯誤。
    }
  }
}

function setDanmakuStyleControlsDisabled(disabled: boolean) {
  danmakuFontFamily.disabled = disabled;
  for (const control of danmakuStyleControls) control.input.disabled = disabled;
  danmakuStyleReset.disabled = disabled;
}

function renderDanmakuStyle() {
  for (const control of danmakuStyleControls) {
    const value = popupDanmakuStyle[control.key];
    const speedIndex = popupDanmakuSettings.SPEED_OPTIONS.findIndex(
      ({ value: speed }) => speed === value,
    );
    const label =
      control.key === "speedScale"
        ? (popupDanmakuSettings.SPEED_OPTIONS[speedIndex]?.label ?? "")
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

function updatePopupDanmakuStyle(value: unknown) {
  popupDanmakuStyle = popupDanmakuSettings.normalize(value);
  popupDanmakuStyleRevision++;
  popupDanmakuStyleDirty = true;
  renderDanmakuStyle();
}

async function saveDanmakuStyle() {
  const style = { ...popupDanmakuStyle };
  const revision = popupDanmakuStyleRevision;
  const save = danmakuStyleSaveQueue.then(() =>
    chrome.storage.local.set({
      [popupDanmakuSettings.STORAGE_KEY]: style,
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
    const stored = await chrome.storage.local.get(
      popupDanmakuSettings.STORAGE_KEY,
    );
    style = popupDanmakuSettings.normalize(
      stored[popupDanmakuSettings.STORAGE_KEY],
    );
  } catch {
    style = { ...popupDanmakuSettings.DEFAULTS };
  }
  if (revision === popupDanmakuStyleRevision) {
    popupDanmakuStyle = style;
    renderDanmakuStyle();
  }
  setDanmakuStyleControlsDisabled(false);
}

const captionFontFamily = document.querySelector(
  "#caption-font-family",
) as HTMLSelectElement;
const captionTextColor = document.querySelector(
  "#caption-text-color",
) as HTMLInputElement;
const captionBackgroundColor = document.querySelector(
  "#caption-background-color",
) as HTMLInputElement;
const captionBackgroundOpacity = document.querySelector(
  "#caption-background-opacity",
) as HTMLInputElement;
const captionEdgeStyle = document.querySelector(
  "#caption-edge-style",
) as HTMLSelectElement;
const captionEdgeColor = document.querySelector(
  "#caption-edge-color",
) as HTMLInputElement;
const captionOutlineWidthRow = document.querySelector(
  "#caption-outline-width-row",
) as HTMLElement;
const captionPreview = document.querySelector(
  "#caption-preview",
) as HTMLElement;
const captionStyleControls = [
  {
    key: "fontWeight",
    input: document.querySelector("#caption-font-weight") as HTMLInputElement,
    output: document.querySelector(
      "#caption-font-weight-value",
    ) as HTMLOutputElement,
  },
  {
    key: "lineHeightScale",
    input: document.querySelector("#caption-line-height") as HTMLInputElement,
    output: document.querySelector(
      "#caption-line-height-value",
    ) as HTMLOutputElement,
  },
  {
    key: "fontSizeScale",
    input: document.querySelector("#caption-size") as HTMLInputElement,
    output: document.querySelector("#caption-size-value") as HTMLOutputElement,
  },
  {
    key: "backgroundOpacity",
    input: captionBackgroundOpacity,
    output: document.querySelector(
      "#caption-background-opacity-value",
    ) as HTMLOutputElement,
  },
  {
    key: "outlineWidth",
    input: document.querySelector("#caption-outline-width") as HTMLInputElement,
    output: document.querySelector(
      "#caption-outline-width-value",
    ) as HTMLOutputElement,
  },
  {
    key: "bottomOffset",
    input: document.querySelector("#caption-position") as HTMLInputElement,
    output: document.querySelector(
      "#caption-position-value",
    ) as HTMLOutputElement,
  },
] as const;
const captionStyleReset = document.querySelector(
  "#caption-style-reset",
) as HTMLButtonElement;
let popupCaptionStyle = { ...popupCaptionSettings.DEFAULTS };
let popupCaptionStyleRevision = 0;
let popupCaptionStyleDirty = false;
let captionStyleSaveQueue: Promise<void> = Promise.resolve();
let captionStyleSaveTimer: ReturnType<typeof setTimeout> | undefined;

function setCaptionStyleControlsDisabled(disabled: boolean) {
  captionFontFamily.disabled = disabled;
  captionTextColor.disabled = disabled;
  captionBackgroundColor.disabled = disabled;
  captionBackgroundOpacity.disabled = disabled;
  captionEdgeStyle.disabled = disabled;
  captionEdgeColor.disabled = disabled;
  for (const control of captionStyleControls) control.input.disabled = disabled;
  captionStyleReset.disabled = disabled;
}

function renderCaptionStyle() {
  for (const control of captionStyleControls) {
    const value = popupCaptionStyle[control.key];
    control.input.value = String(value);
    control.output.value =
      control.key === "outlineWidth"
        ? `${value}px`
        : control.key === "fontWeight"
          ? String(value)
          : `${value}%`;
  }
  captionFontFamily.value = popupCaptionStyle.fontFamily;
  captionTextColor.value = popupCaptionStyle.textColor;
  captionBackgroundColor.value = popupCaptionStyle.backgroundColor;
  captionEdgeStyle.value = popupCaptionStyle.edgeStyle;
  captionEdgeColor.value = popupCaptionStyle.edgeColor;
  const edgeEnabled = popupCaptionStyle.edgeStyle !== "none";
  captionEdgeColor.disabled = !edgeEnabled;
  const outlineEnabled = popupCaptionStyle.edgeStyle === "outline";
  const outlineControl = captionStyleControls.find(
    (control) => control.key === "outlineWidth",
  );
  if (outlineControl) outlineControl.input.disabled = !outlineEnabled;
  captionOutlineWidthRow.hidden = !outlineEnabled;
  popupCaptionSettings.apply(captionPreview, popupCaptionStyle);
}

function updatePopupCaptionStyle(value: unknown) {
  popupCaptionStyle = popupCaptionSettings.normalize(value);
  popupCaptionStyleRevision++;
  popupCaptionStyleDirty = true;
  renderCaptionStyle();
}

async function saveCaptionStyle() {
  const style = { ...popupCaptionStyle };
  const revision = popupCaptionStyleRevision;
  const save = captionStyleSaveQueue.then(() =>
    chrome.storage.local.set({
      [popupCaptionSettings.STORAGE_KEY]: style,
    }),
  );
  captionStyleSaveQueue = save.catch(() => {});
  try {
    await save;
    if (revision === popupCaptionStyleRevision) popupCaptionStyleDirty = false;
    showStatus("");
  } catch {
    showStatus(t("popupCannotSaveCaption"), true);
  }
}

function scheduleCaptionStyleSave() {
  if (captionStyleSaveTimer) clearTimeout(captionStyleSaveTimer);
  captionStyleSaveTimer = setTimeout(() => {
    captionStyleSaveTimer = undefined;
    void saveCaptionStyle();
  }, 120);
}

async function loadCaptionStyle() {
  const revision = popupCaptionStyleRevision;
  let style: typeof popupCaptionStyle;
  try {
    const stored = await chrome.storage.local.get(
      popupCaptionSettings.STORAGE_KEY,
    );
    style = popupCaptionSettings.normalize(
      stored[popupCaptionSettings.STORAGE_KEY],
    );
  } catch {
    style = { ...popupCaptionSettings.DEFAULTS };
  }
  if (revision === popupCaptionStyleRevision) popupCaptionStyle = style;
  setCaptionStyleControlsDisabled(false);
  renderCaptionStyle();
}

for (const control of captionStyleControls) {
  control.input.addEventListener("input", () => {
    updatePopupCaptionStyle({
      ...popupCaptionStyle,
      [control.key]: Number(control.input.value),
    });
    scheduleCaptionStyleSave();
  });
  control.input.addEventListener("change", () => {
    if (captionStyleSaveTimer) clearTimeout(captionStyleSaveTimer);
    captionStyleSaveTimer = undefined;
    void saveCaptionStyle();
  });
}

captionFontFamily.addEventListener("change", () => {
  updatePopupCaptionStyle({
    ...popupCaptionStyle,
    fontFamily: captionFontFamily.value,
  });
  void saveCaptionStyle();
});
captionEdgeStyle.addEventListener("change", () => {
  updatePopupCaptionStyle({
    ...popupCaptionStyle,
    edgeStyle: captionEdgeStyle.value,
  });
  void saveCaptionStyle();
});
for (const [input, key] of [
  [captionTextColor, "textColor"],
  [captionBackgroundColor, "backgroundColor"],
  [captionEdgeColor, "edgeColor"],
] as const) {
  input.addEventListener("input", () => {
    updatePopupCaptionStyle({
      ...popupCaptionStyle,
      [key]: input.value,
    });
    scheduleCaptionStyleSave();
  });
  input.addEventListener("change", () => {
    if (captionStyleSaveTimer) clearTimeout(captionStyleSaveTimer);
    captionStyleSaveTimer = undefined;
    void saveCaptionStyle();
  });
}
captionStyleReset.addEventListener("click", () => {
  updatePopupCaptionStyle(popupCaptionSettings.DEFAULTS);
  void saveCaptionStyle();
});

function setShortcutVisibility(
  key: "commentsShortcut" | "screenshotShortcut" | "danmakuShortcut",
  enabled: boolean,
) {
  const button = shortcutButtons.get(key);
  const row = button?.closest<HTMLElement>(".shortcut-row");
  if (row) row.hidden = !enabled;
  if (button) button.disabled = !enabled;

  if (!enabled && recordingKey === key) {
    recordingKey = null;
    renderShortcut(key);
  }
}

function renderShortcut(key: ShortcutKey) {
  const button = shortcutButtons.get(key);
  if (!button) return;
  const value = shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key];
  button.textContent =
    recordingKey === key
      ? t("popupRecordingShortcut")
      : util.formatShortcut(value);
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
  }

  renderShortcuts();
}

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

async function loadToggles() {
  try {
    const stored = await chrome.storage.local.get({
      danmakuEnabled: true,
      commentsEnabled: true,
      screenshotEnabled: true,
      followPlaybackPip: false,
    });
    danmakuToggle.checked = stored.danmakuEnabled !== false;
    commentsToggle.checked = stored.commentsEnabled !== false;
    screenshotToggle.checked = stored.screenshotEnabled !== false;
    followPlaybackPipToggle.checked = stored.followPlaybackPip === true;
  } catch {
    danmakuToggle.checked = true;
    commentsToggle.checked = true;
    screenshotToggle.checked = true;
    followPlaybackPipToggle.checked = false;
  }

  setShortcutVisibility("danmakuShortcut", danmakuToggle.checked);
  setShortcutVisibility("commentsShortcut", commentsToggle.checked);
  setShortcutVisibility("screenshotShortcut", screenshotToggle.checked);
}

danmakuToggle.addEventListener("change", () => {
  setShortcutVisibility("danmakuShortcut", danmakuToggle.checked);
  void saveToggle(danmakuToggle, "danmakuEnabled", () =>
    setShortcutVisibility("danmakuShortcut", danmakuToggle.checked),
  );
});

danmakuFontFamily.addEventListener("change", () => {
  updatePopupDanmakuStyle({
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
    ? popupDanmakuSettings.SPEED_OPTIONS[value]?.value
    : value;
}

for (const control of danmakuStyleControls) {
  control.input.addEventListener("input", () => {
    updatePopupDanmakuStyle({
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
  updatePopupDanmakuStyle(popupDanmakuSettings.DEFAULTS);
  void saveDanmakuStyle();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.seekSeconds) setSeekSeconds(changes.seekSeconds.newValue);
  if (changes.danmakuEnabled) {
    danmakuToggle.checked = changes.danmakuEnabled.newValue !== false;
    setShortcutVisibility("danmakuShortcut", danmakuToggle.checked);
  }
  if (changes.commentsEnabled)
    commentsToggle.checked = changes.commentsEnabled.newValue !== false;
  if (changes.screenshotEnabled)
    screenshotToggle.checked = changes.screenshotEnabled.newValue !== false;
  if (changes.followPlaybackPip)
    followPlaybackPipToggle.checked =
      changes.followPlaybackPip.newValue === true;

  const danmakuChange = changes[popupDanmakuSettings.STORAGE_KEY];
  if (danmakuChange && !popupDanmakuStyleDirty) {
    popupDanmakuStyle = popupDanmakuSettings.normalize(danmakuChange.newValue);
    popupDanmakuStyleRevision++;
    renderDanmakuStyle();
  }

  const captionChange = changes[popupCaptionSettings.STORAGE_KEY];
  if (captionChange && !popupCaptionStyleDirty) {
    popupCaptionStyle = popupCaptionSettings.normalize(captionChange.newValue);
    popupCaptionStyleRevision++;
    renderCaptionStyle();
  }
});

commentsToggle.addEventListener("change", () => {
  setShortcutVisibility("commentsShortcut", commentsToggle.checked);
  void saveToggle(commentsToggle, "commentsEnabled", () =>
    setShortcutVisibility("commentsShortcut", commentsToggle.checked),
  );
});

screenshotToggle.addEventListener("change", () => {
  setShortcutVisibility("screenshotShortcut", screenshotToggle.checked);
  void saveToggle(screenshotToggle, "screenshotEnabled", () =>
    setShortcutVisibility("screenshotShortcut", screenshotToggle.checked),
  );
});

followPlaybackPipToggle.addEventListener("change", () => {
  void saveToggle(followPlaybackPipToggle, "followPlaybackPip");
});

openButton.addEventListener("click", async () => {
  openButton.disabled = true;
  showStatus(t("popupCheckingPip"));

  try {
    const globalState = await chrome.runtime.sendMessage({
      type: "GET_PIP_STATE",
    } satisfies ExtensionMessage);
    setPipOpen(globalState?.pipOpen === true);
    if (pipOpen) {
      showStatus(t("popupClosingPip"));
      const result = await chrome.runtime.sendMessage({
        type: "CLOSE_ALL_PIP",
      } satisfies ExtensionMessage);
      if (!result?.ok) {
        showStatus(t("popupCannotClosePip"), true);
        return;
      }
      setPipOpen(false);
      showStatus("");
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) throw new Error("No active tab");

    if (!tab.url || !/^https?:\/\//.test(tab.url)) {
      showStatus(t("popupOpenOnWebpage"), true);
      return;
    }
    let pipState;
    try {
      pipState = await chrome.tabs.sendMessage(tab.id, {
        type: "PING",
      } satisfies ExtensionMessage);
    } catch {
      const contentScripts = chrome.runtime
        .getManifest()
        .content_scripts?.find((entry) =>
          entry.js?.includes("content/index.js"),
        )?.js;
      if (!contentScripts)
        throw new Error("Content scripts are not configured");

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: contentScripts,
      });
      pipState = { pipOpen: false };
    }

    setPipOpen(pipState?.pipOpen === true);
    if (pipOpen) {
      const result = await chrome.runtime.sendMessage({
        type: "CLOSE_ALL_PIP",
      } satisfies ExtensionMessage);
      if (!result?.ok) {
        showStatus(t("popupCannotClosePip"), true);
        return;
      }
      setPipOpen(false);
      showStatus("");
      return;
    }

    showStatus(t("popupOpeningPip"));
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, {
        type: "OPEN_PIP",
      } satisfies ExtensionMessage);
    } catch {
      result = null;
    }

    if (result && !result.ok && result.code === "GESTURE_REQUIRED") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      result = await chrome.tabs.sendMessage(tab.id, {
        type: "OPEN_PIP",
      } satisfies ExtensionMessage);
    }

    if (!result?.ok) {
      showStatus(result?.message ?? t("popupCannotOpenPip"), true);
      return;
    }

    setPipOpen(true);
    showStatus("");
  } catch {
    showStatus(t("popupCannotOperatePip"), true);
  } finally {
    openButton.disabled = false;
  }
});

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
    shortcutButtons.get(key)?.closest(".shortcut-row")?.querySelector("span")
      ?.textContent ?? t("popupOtherShortcut")
  );
}

function findConflict(shortcut: Shortcut, self: ShortcutKey) {
  const other = util.SHORTCUT_KEYS.find(
    (key) =>
      key !== self &&
      sameShortcut(shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key], shortcut),
  );

  if (other) return shortcutName(other);
  return (
    util
      .getFixedShortcuts()
      .find((entry) => sameShortcut(entry.shortcut, shortcut))?.label ?? null
  );
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
    if (
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.shiftKey &&
      isNavigationKey
    ) {
      showStatus(t("popupNavigationKey"), true);
      return;
    }

    const key = recordingKey;
    const shortcut: Shortcut = {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: util.hasMetaModifier(e),
    };
    const conflict = findConflict(shortcut, key);
    if (conflict) {
      showStatus(t("popupShortcutConflict", conflict), true);
      return;
    }

    recordingKey = null;
    renderShortcut(key);

    try {
      await chrome.storage.local.set({ [key]: shortcut });
      shortcuts.set(key, shortcut);
      renderShortcut(key);
      showStatus("");
    } catch {
      showStatus(t("popupCannotSaveShortcut"), true);
    }
  },
  true,
);

setDanmakuStyleControlsDisabled(true);
setCaptionStyleControlsDisabled(true);
renderDanmakuStyle();
renderCaptionStyle();
void loadShortcuts();
void loadToggles();
void loadSeekSeconds();
void loadDanmakuStyle();
void loadCaptionStyle();
void syncPipState();
