"use strict";

const util = globalThis.PipCompanion.util;
const openButton = document.querySelector("#open-pip") as HTMLButtonElement;
const statusEl = document.querySelector("#status") as HTMLElement;

let pipStateSyncPending = false;
let pipFrameId = 0;
let activeTabId: number | undefined;
let frameScanDone = false;

function setPipOpen(open: boolean) {
  openButton.textContent = open ? "關閉浮窗" : "開啟浮窗";
}

type FramePipState = {
  frameId: number;
  pipOpen: boolean;
  hasVideo: boolean;
  videoArea: number;
};

async function pingFrame(
  tabId: number,
  frameId: number,
): Promise<FramePipState | null> {
  try {
    const response = await chrome.tabs.sendMessage(
      tabId,
      { type: "PING" },
      { frameId },
    );
    return {
      frameId,
      pipOpen: response?.pipOpen === true,
      hasVideo: response?.hasVideo === true,
      videoArea: Number(response?.videoArea) || 0,
    };
  } catch {
    return null;
  }
}

async function getFrameStates(tabId: number): Promise<FramePipState[]> {
  let frameIds: number[] = [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => true,
    });
    frameIds = results.flatMap((result) =>
      result.frameId === undefined ? [] : [result.frameId],
    );
  } catch {
    // Restricted pages may reject frame enumeration; fall back to the main frame.
  }

  const states = (
    await Promise.all([...new Set(frameIds)].map((id) => pingFrame(tabId, id)))
  ).filter((state): state is FramePipState => state !== null);
  if (states.length) return states;

  let mainFrameState = await pingFrame(tabId, 0);
  if (mainFrameState) return [mainFrameState];

  const contentScripts = chrome.runtime
    .getManifest()
    .content_scripts?.find((entry) =>
      entry.js?.includes("content/index.js"),
    )?.js;
  if (!contentScripts) return [];

  await chrome.scripting.executeScript({
    target: { tabId },
    files: contentScripts,
  });
  mainFrameState = await pingFrame(tabId, 0);
  return mainFrameState ? [mainFrameState] : [];
}

function chooseVideoFrame(states: FramePipState[]) {
  return (
    states
      .filter((state) => state.hasVideo)
      .sort((a, b) => b.videoArea - a.videoArea || a.frameId - b.frameId)[0] ??
    states.find((state) => state.frameId === 0) ??
    null
  );
}

async function syncPipState() {
  if (pipStateSyncPending) return;
  pipStateSyncPending = true;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) return;
    if (activeTabId !== tab.id) {
      activeTabId = tab.id;
      frameScanDone = false;
    }

    if (!frameScanDone) {
      const states = await getFrameStates(tab.id);
      const activeFrame = states.find((state) => state.pipOpen);
      pipFrameId = activeFrame?.frameId ?? 0;
      frameScanDone = true;
      setPipOpen(Boolean(activeFrame));
      return;
    }

    const response = await pingFrame(tab.id, pipFrameId);
    if (response) setPipOpen(response.pipOpen);
    else setPipOpen(false);
  } catch {
    // 內容指令碼尚未載入時，維持目前顯示狀態。
  } finally {
    pipStateSyncPending = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "PIP_STATE_CHANGED" || sender.tab?.id !== activeTabId)
    return;
  pipFrameId = sender.frameId ?? 0;
  setPipOpen(message.pipOpen === true);
});

const commentsToggle = document.querySelector(
  "#comments-toggle",
) as HTMLInputElement;
const screenshotToggle = document.querySelector(
  "#screenshot-toggle",
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

function setShortcutVisibility(
  key: "commentsShortcut" | "screenshotShortcut",
  enabled: boolean,
) {
  const row = shortcutButtons.get(key)?.closest<HTMLElement>(".shortcut-row");
  if (row) row.hidden = !enabled;

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
    recordingKey === key ? "按下快捷鍵…" : util.formatShortcut(value);
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

async function loadToggles() {
  try {
    const stored = await chrome.storage.local.get({
      commentsEnabled: true,
      screenshotEnabled: true,
    });
    commentsToggle.checked = stored.commentsEnabled !== false;
    screenshotToggle.checked = stored.screenshotEnabled !== false;
  } catch {
    commentsToggle.checked = true;
    screenshotToggle.checked = true;
  }

  setShortcutVisibility("commentsShortcut", commentsToggle.checked);
  setShortcutVisibility("screenshotShortcut", screenshotToggle.checked);
}

commentsToggle.addEventListener("change", () => {
  setShortcutVisibility("commentsShortcut", commentsToggle.checked);
  void chrome.storage.local.set({ commentsEnabled: commentsToggle.checked });
});

screenshotToggle.addEventListener("change", () => {
  setShortcutVisibility("screenshotShortcut", screenshotToggle.checked);
  void chrome.storage.local.set({
    screenshotEnabled: screenshotToggle.checked,
  });
});

openButton.addEventListener("click", async () => {
  openButton.disabled = true;
  showStatus("正在確認浮窗狀態…");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) throw new Error("No active tab");

    if (!tab.url || !/^https?:\/\//.test(tab.url)) {
      showStatus("請在可存取的網頁上開啟影片。", true);
      return;
    }
    activeTabId = tab.id;
    const states = await getFrameStates(tab.id);
    frameScanDone = true;
    const activeFrame = states.find((state) => state.pipOpen);
    if (activeFrame) {
      pipFrameId = activeFrame.frameId;
      setPipOpen(true);
      showStatus("正在關閉浮窗…");
      const result = await chrome.tabs.sendMessage(
        tab.id,
        { type: "CLOSE_PIP" },
        { frameId: activeFrame.frameId },
      );
      if (!result?.ok) {
        showStatus(result?.message ?? "無法關閉浮窗。", true);
        return;
      }
      pipFrameId = 0;
      setPipOpen(false);
      showStatus("");
      return;
    }

    let targetFrame: FramePipState | null = chooseVideoFrame(states);
    if (!targetFrame) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const refreshedStates = await getFrameStates(tab.id);
      targetFrame = chooseVideoFrame(refreshedStates);
    }
    if (!targetFrame) {
      const fallbackStates =
        states.length > 0 ? states : await getFrameStates(tab.id);
      targetFrame = fallbackStates.find((state) => state.frameId === 0) ?? null;
    }
    if (!targetFrame) throw new Error("No content script frame found");

    showStatus("正在開啟…");
    let result = await chrome.tabs.sendMessage(
      tab.id,
      { type: "OPEN_PIP" },
      { frameId: targetFrame.frameId },
    );

    if (result && !result.ok && /請先開啟/.test(result.message ?? "")) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const refreshedStates = await getFrameStates(tab.id);
      const refreshedFrame = chooseVideoFrame(refreshedStates);
      if (refreshedFrame) {
        targetFrame = refreshedFrame;
        result = await chrome.tabs.sendMessage(
          tab.id,
          { type: "OPEN_PIP" },
          { frameId: targetFrame.frameId },
        );
      }
    }

    if (!result?.ok) {
      showStatus(
        result?.message ?? "無法開啟浮窗，請確認頁面中有可播放的影片。",
        true,
      );
      return;
    }

    pipFrameId = targetFrame.frameId;
    setPipOpen(true);
    showStatus("");
  } catch {
    showStatus("無法操作浮窗，請確認目前頁面允許擴充功能存取。", true);
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
      ?.textContent ?? "其他快捷鍵"
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
    util.FIXED_SHORTCUTS.find((entry) => sameShortcut(entry.shortcut, shortcut))
      ?.label ?? null
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

    if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

    if (e.code === "Unidentified") {
      showStatus("無法辨識此按鍵，請換一組！", true);
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
      showStatus("系統導航鍵（Tab、Enter 等）不可作為單鍵！", true);
      return;
    }

    const key = recordingKey;
    const shortcut: Shortcut = {
      code: e.code,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    };
    const conflict = findConflict(shortcut, key);
    if (conflict) {
      showStatus(`與「${conflict}」重複，請換一組！`, true);
      return;
    }

    recordingKey = null;
    shortcuts.set(key, shortcut);
    renderShortcuts();

    try {
      await chrome.storage.local.set({ [key]: shortcut });
      showStatus("");
    } catch {
      showStatus("無法儲存快捷鍵，請重新嘗試。", true);
    }
  },
  true,
);

void loadShortcuts();
void loadToggles();
void syncPipState();
window.setInterval(() => void syncPipState(), 500);
