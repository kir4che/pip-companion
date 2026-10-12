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
const openButtonLabel = document.querySelector(
  "#open-pip-label",
) as HTMLElement;
const launchShortcutLabel = document.querySelector(
  "#launch-shortcut",
) as HTMLElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const openOptionsButton = document.querySelector(
  "#open-options-page",
) as HTMLButtonElement | null;
openOptionsButton?.addEventListener("click", () => {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL("ui/options/index.html"));
});

const versionEl = document.querySelector("#ext-version") as HTMLElement | null;
if (versionEl) versionEl.textContent = chrome.runtime.getManifest().version;

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

function renderLaunchShortcut(
  value: unknown = util.SHORTCUT_DEFAULTS.launchShortcut,
) {
  const shortcut = util.normalizeShortcut(
    value,
    util.SHORTCUT_DEFAULTS.launchShortcut,
  );
  launchShortcutLabel.textContent = util.formatShortcut(shortcut);
  openButton.setAttribute(
    "aria-keyshortcuts",
    util.formatShortcut(shortcut, true),
  );
}

renderLaunchShortcut();

async function loadLaunchShortcut() {
  try {
    const stored = await chrome.storage.local.get("launchShortcut");
    renderLaunchShortcut(stored.launchShortcut);
  } catch {
    // 儲存空間無法使用時，保留預設快捷鍵顯示。
  }
}

function setPipOpen(open: boolean) {
  pipOpen = open;
  openButtonLabel.textContent = open ? t("popupClosePip") : t("popupOpenPip");
}

function refreshPopupLocale() {
  refreshLocalizedMarkup();
  setPipOpen(pipOpen);
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
}

danmakuToggle.addEventListener("change", () => {
  void saveToggle(danmakuToggle, "danmakuEnabled");
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

  if (changes.uiLanguage) {
    util.setLanguagePreference(changes.uiLanguage.newValue);
    refreshPopupLocale();
  }
  if (changes.danmakuEnabled)
    danmakuToggle.checked = changes.danmakuEnabled.newValue !== false;
  if (changes.commentsEnabled)
    commentsToggle.checked = changes.commentsEnabled.newValue !== false;
  if (changes.screenshotEnabled)
    screenshotToggle.checked = changes.screenshotEnabled.newValue !== false;
  if (changes.followPlaybackPip)
    followPlaybackPipToggle.checked =
      changes.followPlaybackPip.newValue === true;
  if (changes.launchShortcut)
    renderLaunchShortcut(changes.launchShortcut.newValue);

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
  void saveToggle(commentsToggle, "commentsEnabled");
});

screenshotToggle.addEventListener("change", () => {
  void saveToggle(screenshotToggle, "screenshotEnabled");
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

setDanmakuStyleControlsDisabled(true);
setCaptionStyleControlsDisabled(true);
renderDanmakuStyle();
renderCaptionStyle();
void loadToggles();
void loadLaunchShortcut();
void loadDanmakuStyle();
void loadCaptionStyle();
void syncPipState();
