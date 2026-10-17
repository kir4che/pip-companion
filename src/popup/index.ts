"use strict";
export {};

const util = globalThis.PipCompanion.util;
const storage = globalThis.PipCompanion.storage;
const { uiLanguage } = await storage.local.get("uiLanguage");
util.setLanguagePreference(uiLanguage);
const popupDanmakuSettings = globalThis.PipCompanion.danmakuSettings;
const popupSubtitleSettings = globalThis.PipCompanion.subtitleSettings;
const t = util.getMessage;
const refreshMarkup = globalThis.PipCompanion.localizedMarkup.create(
  document,
  t,
);

function refreshLocalizedMarkup() {
  refreshMarkup();
  document.documentElement.lang = util.getHtmlLanguage();
}

refreshLocalizedMarkup();
globalThis.PipCompanion.customSelect.enhanceAll();

const openButton = document.querySelector("#open-pip") as HTMLButtonElement;
const openButtonLabel = document.querySelector(
  "#open-pip-label",
) as HTMLElement;
const launchShortcutLabel = document.querySelector(
  "#launch-shortcut",
) as HTMLElement;
const statusEl = document.querySelector("#status") as HTMLElement;

function showStatus(message: string, error = false) {
  statusEl.textContent = message;
  statusEl.dataset.error = String(error);
}

const openOptionsButton = document.querySelector(
  "#open-options-page",
) as HTMLButtonElement | null;
openOptionsButton?.addEventListener("click", () => {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL("ui/options/index.html"));
});

const versionEl = document.querySelector("#ext-version") as HTMLElement | null;
if (versionEl) versionEl.textContent = chrome.runtime.getManifest().version;

globalThis.PipCompanion.settingsNavigation.create(document);

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
  const ariaShortcut = util.formatShortcut(shortcut, true);
  if (ariaShortcut) openButton.setAttribute("aria-keyshortcuts", ariaShortcut);
  else openButton.removeAttribute("aria-keyshortcuts");
}

renderLaunchShortcut();

async function loadLaunchShortcut() {
  try {
    const stored = await storage.local.get("launchShortcut");
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
  danmakuStyleOptions.render();
  subtitleStyleOptions.render();
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

globalThis.PipCompanion.runtimeMessages.addListener(
  "PIP_GLOBAL_STATE",
  (message: unknown) => {
    if (
      globalThis.PipCompanion.util.isExtensionMessage(message) &&
      message.type === "PIP_GLOBAL_STATE"
    )
      setPipOpen(message.pipOpen);
  },
);

const danmakuToggle = document.querySelector(
  "#danmaku-toggle",
) as HTMLInputElement;
const danmakuStyleOptions = globalThis.PipCompanion.danmakuStyleOptions.create({
  storage: storage.local,
  settings: popupDanmakuSettings,
  t,
  showStatus,
});

const extraBilibiliEnabled = document.querySelector(
  "#extra-bilibili-enabled",
) as HTMLInputElement;
const extraBilibiliUrl = document.querySelector(
  "#extra-bilibili-url",
) as HTMLInputElement;
const extraBilibiliOffset = document.querySelector(
  "#extra-bilibili-offset",
) as HTMLInputElement;
const extraBilibiliOffsetError = document.querySelector(
  "#extra-bilibili-offset-error",
) as HTMLElement;
const extraBilibiliUrlHint = document.querySelector(
  "#extra-bilibili-url-hint",
) as HTMLElement;
const extraBilibiliStatus = document.querySelector(
  "#extra-bilibili-status",
) as HTMLElement;
const extraBilibiliSwitchConfirm = document.querySelector(
  "#extra-bilibili-switch-confirm",
) as HTMLElement;
const extraBilibiliSwitchConfirmYes = document.querySelector(
  "#extra-bilibili-switch-confirm-yes",
) as HTMLButtonElement;
const extraBilibiliSwitchConfirmNo = document.querySelector(
  "#extra-bilibili-switch-confirm-no",
) as HTMLButtonElement;
const commentsToggle = document.querySelector(
  "#comments-toggle",
) as HTMLInputElement;
const screenshotToggle = document.querySelector(
  "#screenshot-toggle",
) as HTMLInputElement;
const followPlaybackPipToggle = document.querySelector(
  "#follow-playback-pip-toggle",
) as HTMLInputElement;
globalThis.PipCompanion.extraBilibiliSettings.create({
  enabled: extraBilibiliEnabled,
  url: extraBilibiliUrl,
  offset: extraBilibiliOffset,
  offsetError: extraBilibiliOffsetError,
  urlHint: extraBilibiliUrlHint,
  status: extraBilibiliStatus,
  switchConfirm: extraBilibiliSwitchConfirm,
  switchConfirmYes: extraBilibiliSwitchConfirmYes,
  switchConfirmNo: extraBilibiliSwitchConfirmNo,
  util,
  storage: storage.session,
  t,
});

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
    await storage.local.set({ [key]: toggle.checked });
  } catch {
    showStatus(t("popupCannotSaveToggle"), true);
    try {
      const stored = await storage.local.get(key);
      toggle.checked = stored[key] !== false;
      onRestore?.();
    } catch {
      // 無法讀取已儲存狀態時，保留目前值並顯示錯誤。
    }
  }
}

const subtitleStyleOptions =
  globalThis.PipCompanion.popupSubtitleStyleOptions.create({
    storage: storage.local,
    settings: popupSubtitleSettings,
    t,
    showStatus,
  });

async function loadToggles() {
  try {
    const stored = await storage.local.get({
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

  danmakuStyleOptions.handleStorageChange(
    changes[popupDanmakuSettings.STORAGE_KEY],
  );

  subtitleStyleOptions.handleStorageChange(changes);
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
      const [injectionState] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => Boolean(globalThis.PipCompanion?.locales),
      });
      if (injectionState?.result)
        throw new Error("Content scripts already started");

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
    window.close();
  } catch {
    showStatus(t("popupCannotOperatePip"), true);
  } finally {
    openButton.disabled = false;
  }
});

danmakuStyleOptions.setControlsDisabled(true);
subtitleStyleOptions.setControlsDisabled(true);
danmakuStyleOptions.render();
subtitleStyleOptions.render();
void loadToggles();
void loadLaunchShortcut();
void danmakuStyleOptions.load();
void subtitleStyleOptions.load();
void syncPipState();
