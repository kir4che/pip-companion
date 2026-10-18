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
const pauseOnPipCloseToggle = document.querySelector(
  "#pause-on-pip-close-toggle",
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
    | "pauseOnPipClose"
    | "thumbnailPreviewEnabled",
) {
  try {
    await storage.local.set({ [key]: toggle.checked });
  } catch {
    showStatus(t("popupCannotSaveToggle"), true);
    try {
      const stored = await storage.local.get(key);
      toggle.checked = stored[key] !== false;
    } catch {
      // 無法讀取
    }
  }
}

async function loadToggles() {
  try {
    const stored = await storage.local.get({
      danmakuEnabled: true,
      commentsEnabled: true,
      screenshotEnabled: true,
      followPlaybackPip: true,
      pauseOnPipClose: true,
      thumbnailPreviewEnabled: true,
    });
    danmakuToggle.checked = stored.danmakuEnabled !== false;
    commentsToggle.checked = stored.commentsEnabled !== false;
    screenshotToggle.checked = stored.screenshotEnabled !== false;
    followPlaybackPipToggle.checked = stored.followPlaybackPip !== false;
    pauseOnPipCloseToggle.checked = stored.pauseOnPipClose !== false;
    thumbnailPreviewToggle.checked = stored.thumbnailPreviewEnabled !== false;
  } catch {
    danmakuToggle.checked = true;
    commentsToggle.checked = true;
    screenshotToggle.checked = true;
    followPlaybackPipToggle.checked = true;
    pauseOnPipCloseToggle.checked = true;
    thumbnailPreviewToggle.checked = true;
  } finally {
    danmakuToggle.disabled = false;
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
