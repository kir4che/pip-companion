"use strict";
export {};

const util = globalThis.PipCompanion.util;
const storage = globalThis.PipCompanion.storage;
let uiLanguage: unknown;
try {
  ({ uiLanguage } = await storage.local.get("uiLanguage"));
} catch {
  // 儲存空間無法使用時，改採瀏覽器語言。
}
util.setLanguagePreference(uiLanguage);
const danmakuSettings = globalThis.PipCompanion.danmakuSettings;
const subtitleSettings = globalThis.PipCompanion.subtitleSettings;
const subtitleTranslationSettings =
  globalThis.PipCompanion.subtitleTranslationSettings;
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
    await storage.local.set({ uiLanguage: nextLanguage });
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
  shortcutOptions.render();
  danmakuStyleOptions.render();
  subtitleStyleOptions.render();
  subtitleTranslationOptions.render();
}

const subtitleTranslationOptions =
  globalThis.PipCompanion.subtitleTranslationOptions.create({
    storage: storage.local,
    settings: subtitleTranslationSettings,
    configApi: globalThis.PipCompanion.subtitleTranslationConfig,
    t,
    showStatus,
  });

const shortcutOptions = globalThis.PipCompanion.optionsShortcutSettings.create({
  storage: storage.local,
  util,
  shortcutInput: globalThis.PipCompanion.shortcutInput,
  t,
  showStatus,
});

// 快進快退秒數
function setSeekSeconds(value: unknown) {
  seekSecondsSelect.value = String(util.normalizeSeekSeconds(value));
}

async function loadSeekSeconds() {
  seekSecondsSelect.disabled = true;
  try {
    const stored = await storage.local.get({
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
    await storage.local.set({ seekSeconds });
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
const TOGGLE_DEFAULTS = {
  danmakuEnabled: true,
  danmakuJumpEnabled: false,
  commentsEnabled: true,
  screenshotEnabled: true,
  followPlaybackPip: true,
  pauseOnPipClose: true,
  thumbnailPreviewEnabled: true,
};

type ToggleKey = keyof typeof TOGGLE_DEFAULTS;

// 預設值單一來源：未儲存過的 key 回到 TOGGLE_DEFAULTS，已儲存的只認顯式 false。
function readToggleValue(
  stored: Record<string, unknown>,
  key: ToggleKey,
): boolean {
  const value = stored[key];
  return value === undefined ? TOGGLE_DEFAULTS[key] : value !== false;
}

const danmakuToggle = document.querySelector(
  "#danmaku-toggle",
) as HTMLInputElement;
const danmakuJumpToggle = document.querySelector(
  "#danmaku-jump-toggle",
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
const pauseOnPipCloseToggle = document.querySelector(
  "#pause-on-pip-close-toggle",
) as HTMLInputElement;
const thumbnailPreviewToggle = document.querySelector(
  "#thumbnail-preview-toggle",
) as HTMLInputElement;

async function saveToggle(toggle: HTMLInputElement, key: ToggleKey) {
  try {
    await storage.local.set({ [key]: toggle.checked });
  } catch {
    showStatus(t("popupCannotSaveToggle"), true);
    try {
      const stored = await storage.local.get(key);
      toggle.checked = readToggleValue(stored, key);
    } catch {
      // 無法讀取
    }
  }
}

async function loadToggles() {
  try {
    const stored = await storage.local.get(TOGGLE_DEFAULTS);
    danmakuToggle.checked = readToggleValue(stored, "danmakuEnabled");
    danmakuJumpToggle.checked = readToggleValue(stored, "danmakuJumpEnabled");
    commentsToggle.checked = readToggleValue(stored, "commentsEnabled");
    screenshotToggle.checked = readToggleValue(stored, "screenshotEnabled");
    followPlaybackPipToggle.checked = readToggleValue(
      stored,
      "followPlaybackPip",
    );
    pauseOnPipCloseToggle.checked = readToggleValue(stored, "pauseOnPipClose");
    thumbnailPreviewToggle.checked = readToggleValue(
      stored,
      "thumbnailPreviewEnabled",
    );
  } catch {
    danmakuToggle.checked = TOGGLE_DEFAULTS.danmakuEnabled;
    danmakuJumpToggle.checked = TOGGLE_DEFAULTS.danmakuJumpEnabled;
    commentsToggle.checked = TOGGLE_DEFAULTS.commentsEnabled;
    screenshotToggle.checked = TOGGLE_DEFAULTS.screenshotEnabled;
    followPlaybackPipToggle.checked = TOGGLE_DEFAULTS.followPlaybackPip;
    pauseOnPipCloseToggle.checked = TOGGLE_DEFAULTS.pauseOnPipClose;
    thumbnailPreviewToggle.checked = TOGGLE_DEFAULTS.thumbnailPreviewEnabled;
  } finally {
    danmakuToggle.disabled = false;
    danmakuJumpToggle.disabled = false;
    commentsToggle.disabled = false;
    screenshotToggle.disabled = false;
    followPlaybackPipToggle.disabled = false;
    pauseOnPipCloseToggle.disabled = false;
    thumbnailPreviewToggle.disabled = false;
  }
}

danmakuToggle.addEventListener("change", () => {
  void saveToggle(danmakuToggle, "danmakuEnabled");
});
danmakuJumpToggle.addEventListener("change", () => {
  void saveToggle(danmakuJumpToggle, "danmakuJumpEnabled");
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
pauseOnPipCloseToggle.addEventListener("change", () => {
  void saveToggle(pauseOnPipCloseToggle, "pauseOnPipClose");
});
thumbnailPreviewToggle.addEventListener("change", () => {
  void saveToggle(thumbnailPreviewToggle, "thumbnailPreviewEnabled");
});

// 彈幕設定
const danmakuStyleOptions = globalThis.PipCompanion.danmakuStyleOptions.create({
  storage: storage.local,
  settings: danmakuSettings,
  t,
  showStatus,
});

const subtitleStyleOptions =
  globalThis.PipCompanion.optionsSubtitleStyleOptions.create({
    storage: storage.local,
    settings: subtitleSettings,
    t,
    showStatus,
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
  if (changes.danmakuJumpEnabled)
    danmakuJumpToggle.checked = changes.danmakuJumpEnabled.newValue === true;
  if (changes.commentsEnabled)
    commentsToggle.checked = changes.commentsEnabled.newValue !== false;
  if (changes.screenshotEnabled)
    screenshotToggle.checked = changes.screenshotEnabled.newValue !== false;
  if (changes.followPlaybackPip)
    followPlaybackPipToggle.checked =
      changes.followPlaybackPip.newValue !== false;
  if (changes.pauseOnPipClose)
    pauseOnPipCloseToggle.checked = changes.pauseOnPipClose.newValue !== false;
  if (changes.thumbnailPreviewEnabled)
    thumbnailPreviewToggle.checked =
      changes.thumbnailPreviewEnabled.newValue !== false;

  shortcutOptions.handleStorageChange(changes);

  danmakuStyleOptions.handleStorageChange(changes[danmakuSettings.STORAGE_KEY]);

  const translationConfigChange =
    changes[subtitleTranslationSettings.CONFIG_KEY];
  if (translationConfigChange)
    subtitleTranslationOptions.update(translationConfigChange.newValue);

  subtitleStyleOptions.handleStorageChange(changes);
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

danmakuStyleOptions.setControlsDisabled(true);
subtitleStyleOptions.setControlsDisabled();
danmakuStyleOptions.render();
subtitleStyleOptions.render();
void shortcutOptions.load();
void loadToggles();
void loadSeekSeconds();
void danmakuStyleOptions.load();
subtitleStyleOptions.load();
void subtitleTranslationOptions.load();
