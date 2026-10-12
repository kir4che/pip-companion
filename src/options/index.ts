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
const captionSettings = globalThis.PipCompanion.captionSettings;
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
  renderCaptionStyle();
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

async function saveToggle(
  toggle: HTMLInputElement,
  key:
    | "danmakuEnabled"
    | "commentsEnabled"
    | "screenshotEnabled"
    | "followPlaybackPip",
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
  } finally {
    danmakuToggle.disabled = false;
    commentsToggle.disabled = false;
    screenshotToggle.disabled = false;
    followPlaybackPipToggle.disabled = false;
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

let popupCaptionStyle = { ...captionSettings.DEFAULTS };
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
  captionSettings.apply(captionPreview, popupCaptionStyle);
}

function updateCaptionStyle(value: unknown) {
  popupCaptionStyle = captionSettings.normalize(value);
  popupCaptionStyleRevision++;
  popupCaptionStyleDirty = true;
  renderCaptionStyle();
}

async function saveCaptionStyle() {
  const style = { ...popupCaptionStyle };
  const revision = popupCaptionStyleRevision;
  const save = captionStyleSaveQueue.then(() =>
    chrome.storage.local.set({
      [captionSettings.STORAGE_KEY]: style,
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
    const stored = await chrome.storage.local.get(captionSettings.STORAGE_KEY);
    style = captionSettings.normalize(stored[captionSettings.STORAGE_KEY]);
  } catch {
    style = { ...captionSettings.DEFAULTS };
  }
  if (revision === popupCaptionStyleRevision) popupCaptionStyle = style;
  setCaptionStyleControlsDisabled(false);
  renderCaptionStyle();
}

for (const control of captionStyleControls) {
  control.input.addEventListener("input", () => {
    updateCaptionStyle({
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
  updateCaptionStyle({
    ...popupCaptionStyle,
    fontFamily: captionFontFamily.value,
  });
  void saveCaptionStyle();
});
captionEdgeStyle.addEventListener("change", () => {
  updateCaptionStyle({
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
    updateCaptionStyle({
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
  updateCaptionStyle(captionSettings.DEFAULTS);
  void saveCaptionStyle();
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

  const captionChange = changes[captionSettings.STORAGE_KEY];
  if (captionChange && !popupCaptionStyleDirty) {
    popupCaptionStyle = captionSettings.normalize(captionChange.newValue);
    popupCaptionStyleRevision++;
    renderCaptionStyle();
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
setCaptionStyleControlsDisabled(true);
renderDanmakuStyle();
renderCaptionStyle();
void loadShortcuts();
void loadToggles();
void loadSeekSeconds();
void loadDanmakuStyle();
void loadCaptionStyle();
