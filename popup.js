const DEFAULT_SHORTCUT = {
  code: "KeyP",
  ctrl: false,
  alt: true,
  shift: true,
  meta: false,
};
const openButton = document.querySelector("#open-pip");
const shortcutButton = document.querySelector("#shortcut");
const statusEl = document.querySelector("#status");
let shortcut = { ...DEFAULT_SHORTCUT };
let recordingShortcut = false;

function normalizeShortcut(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_SHORTCUT };
  return {
    code: typeof value.code === "string" ? value.code : DEFAULT_SHORTCUT.code,
    ctrl: typeof value.ctrl === "boolean" ? value.ctrl : DEFAULT_SHORTCUT.ctrl,
    alt: typeof value.alt === "boolean" ? value.alt : DEFAULT_SHORTCUT.alt,
    shift:
      typeof value.shift === "boolean" ? value.shift : DEFAULT_SHORTCUT.shift,
    meta: typeof value.meta === "boolean" ? value.meta : DEFAULT_SHORTCUT.meta,
  };
}

function formatShortcut(value) {
  const mac = navigator.platform.includes("Mac");
  const parts = [];
  if (value.ctrl) parts.push(mac ? "⌃" : "Ctrl");
  if (value.alt) parts.push(mac ? "⌥" : "Alt");
  if (value.shift) parts.push(mac ? "⇧" : "Shift");
  if (value.meta) parts.push(mac ? "⌘" : "Meta");
  const key = value.code.startsWith("Key")
    ? value.code.slice(3)
    : value.code.startsWith("Digit")
      ? value.code.slice(5)
      : value.code === "Space"
        ? "Space"
        : value.code;
  parts.push(key);
  return parts.join(mac ? "" : "+");
}

function showStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.dataset.error = String(error);
}

function updateShortcutButton() {
  shortcutButton.textContent = recordingShortcut
    ? "按下快捷鍵…"
    : formatShortcut(shortcut);
}

async function loadShortcut() {
  try {
    const stored = await chrome.storage.local.get("launchShortcut");
    shortcut = normalizeShortcut(stored.launchShortcut);
  } catch {
    shortcut = { ...DEFAULT_SHORTCUT };
  }
  updateShortcutButton();
}

openButton.addEventListener("click", async () => {
  openButton.disabled = true;
  showStatus("正在開啟…");
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) throw new Error("No active tab");
    if (!tab.url || new URL(tab.url).origin !== "https://www.youtube.com") {
      showStatus("請確認已開啟 YouTube 影片頁面", true);
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "PING" });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["floating-comments.js", "content.js"],
      });
    }
    const result = await chrome.tabs.sendMessage(tab.id, { type: "OPEN_PIP" });
    if (!result?.ok) {
      showStatus(result?.message ?? "請在 YouTube 影片頁面使用", true);
      return;
    }
    window.close();
  } catch {
    showStatus("請確認已開啟 YouTube 影片頁面", true);
  } finally {
    openButton.disabled = false;
  }
});

shortcutButton.addEventListener("click", () => {
  recordingShortcut = true;
  updateShortcutButton();
  showStatus("請按下含 Ctrl、Alt 或 ⌘ 的組合鍵；Esc 取消。");
});

document.addEventListener(
  "keydown",
  async (event) => {
    if (!recordingShortcut) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      recordingShortcut = false;
      updateShortcutButton();
      showStatus("快捷鍵設定未變更");
      return;
    }
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
    if (
      event.code === "Unidentified" ||
      !(event.ctrlKey || event.altKey || event.metaKey)
    ) {
      showStatus("快捷鍵需包含 Ctrl、Alt 或 ⌘", true);
      return;
    }
    shortcut = {
      code: event.code,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    };
    recordingShortcut = false;
    updateShortcutButton();
    try {
      await chrome.storage.local.set({ launchShortcut: shortcut });
      showStatus("快捷鍵已儲存；請在 YouTube 頁面使用。");
    } catch {
      showStatus("無法儲存快捷鍵。", true);
    }
  },
  true,
);

void loadShortcut();
