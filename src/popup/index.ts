"use strict";
export {};

const util = globalThis.PipCompanion.util;
const { uiLanguage } = await chrome.storage.local.get("uiLanguage");
util.setLanguagePreference(uiLanguage);
const popupDanmakuSettings = globalThis.PipCompanion.danmakuSettings;
const popupSubtitleSettings = globalThis.PipCompanion.subtitleSettings;
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
const additionalDanmakuSettingsView = document.querySelector(
  "#additional-danmaku-settings-view",
) as HTMLElement;
const additionalDanmakuOpen = document.querySelector(
  "#additional-danmaku-open",
) as HTMLButtonElement;
const additionalDanmakuBack = document.querySelector(
  "#additional-danmaku-back",
) as HTMLButtonElement;
const subtitleSettingsView = document.querySelector(
  "#subtitle-settings-view",
) as HTMLElement;
const subtitleSettingsOpen = document.querySelector(
  "#subtitle-settings-open",
) as HTMLButtonElement;
const subtitleSettingsBack = document.querySelector(
  "#subtitle-settings-back",
) as HTMLButtonElement;
let activeSettingsView: "danmaku" | "subtitle" | "additional" = "danmaku";

function setSettingsView(view: "menu" | "danmaku" | "subtitle" | "additional") {
  menuView.hidden = view !== "menu";
  danmakuSettingsView.hidden = view !== "danmaku";
  additionalDanmakuSettingsView.hidden = view !== "additional";
  subtitleSettingsView.hidden = view !== "subtitle";
  if (view !== "menu") activeSettingsView = view;
  const focusTarget =
    view === "menu"
      ? activeSettingsView === "danmaku"
        ? danmakuSettingsOpen
        : activeSettingsView === "subtitle"
          ? subtitleSettingsOpen
          : additionalDanmakuOpen
      : view === "danmaku"
        ? danmakuSettingsBack
        : view === "subtitle"
          ? subtitleSettingsBack
          : additionalDanmakuBack;
  focusTarget.focus();
}

danmakuSettingsOpen.addEventListener("click", () => setSettingsView("danmaku"));
danmakuSettingsBack.addEventListener("click", () => setSettingsView("menu"));
additionalDanmakuOpen.addEventListener("click", () =>
  setSettingsView("additional"),
);
additionalDanmakuBack.addEventListener("click", () => setSettingsView("menu"));
subtitleSettingsOpen.addEventListener("click", () =>
  setSettingsView("subtitle"),
);
subtitleSettingsBack.addEventListener("click", () => setSettingsView("menu"));

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
  renderSubtitleStyle();
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
const additionalBilibiliEnabled = document.querySelector(
  "#additional-bilibili-enabled",
) as HTMLInputElement;
const additionalBilibiliUrl = document.querySelector(
  "#additional-bilibili-url",
) as HTMLInputElement;
const additionalBilibiliOffset = document.querySelector(
  "#additional-bilibili-offset",
) as HTMLInputElement;
const additionalBilibiliUrlError = document.querySelector(
  "#additional-bilibili-url-error",
) as HTMLElement;
const additionalBilibiliOffsetError = document.querySelector(
  "#additional-bilibili-offset-error",
) as HTMLElement;
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
let additionalSourceSaveQueue: Promise<void> = Promise.resolve();
let additionalSourceSaveRevision = 0;
let additionalBilibiliSourceEdited = false;
let additionalBilibiliTabId: number | undefined;
let additionalSourceLoadError: string | null = null;
let additionalSourceErrorRevision = -1;

function showStatus(message: string, error = false) {
  statusEl.textContent = message;
  statusEl.dataset.error = String(error);
}

function setAdditionalSourceLoadError(error: string | null): void {
  const previousError = additionalSourceLoadError;
  additionalSourceLoadError = error;
  if (error) {
    setAdditionalBilibiliInputError("url", error);
  } else if (
    previousError &&
    additionalBilibiliUrlError.textContent === previousError
  ) {
    setAdditionalBilibiliInputError("url", null);
  }
}

function clearAdditionalSourceLoadError(): void {
  setAdditionalSourceLoadError(null);
}

function updateAdditionalSourceError(
  error: string | null,
  revision: number,
): void {
  if (revision < additionalSourceErrorRevision) return;
  additionalSourceErrorRevision = revision;
  setAdditionalSourceLoadError(error);
}

async function sendAdditionalDanmakuMessage(
  message: ExtensionMessage,
): Promise<unknown> {
  let tabId = additionalBilibiliTabId;
  if (tabId === undefined) {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (activeTab?.id === undefined) throw new Error("No active browser tab");
    tabId = activeTab.id;
    additionalBilibiliTabId = tabId;
  }
  try {
    await chrome.tabs.get(tabId);
  } catch {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (activeTab?.id === undefined) throw new Error("No active browser tab");
    tabId = activeTab.id;
    additionalBilibiliTabId = tabId;
  }
  return chrome.tabs.sendMessage(tabId, message);
}

function setAdditionalBilibiliInputError(
  field: "url" | "offset",
  message: string | null,
): void {
  const input =
    field === "url" ? additionalBilibiliUrl : additionalBilibiliOffset;
  const tooltip =
    field === "url"
      ? additionalBilibiliUrlError
      : additionalBilibiliOffsetError;
  input.classList.toggle("is-error", message !== null);
  if (message) {
    tooltip.textContent = message;
    input.setAttribute("aria-describedby", tooltip.id);
  } else {
    tooltip.textContent = "";
    input.removeAttribute("aria-describedby");
  }
}

type AdditionalBilibiliSourceSettings = {
  enabled: boolean;
  url: string;
  offsetSeconds: number;
};

function parseAdditionalBilibiliSource(
  value: unknown,
): AdditionalBilibiliSourceSettings | null {
  if (
    !util.isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.url !== "string" ||
    value.url.length > 2048 ||
    typeof value.offsetSeconds !== "number" ||
    !Number.isFinite(value.offsetSeconds) ||
    Math.abs(value.offsetSeconds) > 3600
  )
    return null;
  return {
    enabled: value.enabled,
    url: value.url,
    offsetSeconds: value.offsetSeconds,
  };
}

function hasAdditionalBilibiliSourceSettings(
  source: AdditionalBilibiliSourceSettings | null,
): boolean {
  return Boolean(
    source && (source.enabled || source.url || source.offsetSeconds !== 0),
  );
}

function additionalBilibiliSourceStorageKey(tabId: number): string {
  return `additionalBilibiliSource:${tabId}`;
}

function setAdditionalBilibiliAvailability(available: boolean): void {
  additionalBilibiliEnabled.disabled = !available;
  additionalBilibiliUrl.disabled = !available;
  additionalBilibiliOffset.disabled = !available;
}

function renderAdditionalBilibiliSource(value: unknown) {
  const source = util.isRecord(value) ? value : {};
  setAdditionalBilibiliAvailability(source.available !== false);
  additionalBilibiliEnabled.checked = source.enabled === true;
  additionalBilibiliUrl.value =
    typeof source.url === "string" ? source.url : "";
  additionalBilibiliOffset.value = String(
    typeof source.offsetSeconds === "number" &&
      Number.isFinite(source.offsetSeconds)
      ? Math.max(-3600, Math.min(3600, source.offsetSeconds))
      : 0,
  );
}

async function loadAdditionalBilibiliSource() {
  const revision = additionalSourceSaveRevision;
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (activeTab?.id === undefined) throw new Error("No active browser tab");
    const tabId = activeTab.id;
    additionalBilibiliTabId = tabId;
    const storageKey = additionalBilibiliSourceStorageKey(tabId);
    let sourceMessageError: string | null = null;
    let storageReadError: string | null = null;
    const [liveSource, storedValues] = await Promise.all([
      chrome.tabs
        .sendMessage(tabId, {
          type: "GET_ADDITIONAL_DANMAKU_SOURCE",
        } satisfies ExtensionMessage)
        .catch(() => {
          sourceMessageError = t("popupAdditionalDanmakuConnectionFailed");
          return null;
        }),
      chrome.storage.session.get(storageKey).catch(() => {
        storageReadError = t("popupAdditionalDanmakuStorageFailed");
        return {} as Record<string, unknown>;
      }),
    ]);
    if (
      revision !== additionalSourceSaveRevision ||
      additionalBilibiliSourceEdited
    )
      return;

    const liveSettings = parseAdditionalBilibiliSource(liveSource);
    const storedSettings = parseAdditionalBilibiliSource(
      storedValues[storageKey],
    );
    let sourceToRender: unknown = liveSource;
    if (!hasAdditionalBilibiliSourceSettings(liveSettings) && storedSettings) {
      const restoredSettings = { ...storedSettings, enabled: false };
      sourceToRender = restoredSettings;
      try {
        sourceToRender = await chrome.tabs.sendMessage(tabId, {
          type: "SET_ADDITIONAL_DANMAKU_SOURCE",
          source: restoredSettings,
        } satisfies ExtensionMessage);
        sourceMessageError = null;
      } catch {
        sourceMessageError = t("popupAdditionalDanmakuApplyFailed");
      }
      if (
        revision !== additionalSourceSaveRevision ||
        additionalBilibiliSourceEdited
      )
        return;
    } else if (
      liveSettings &&
      hasAdditionalBilibiliSourceSettings(liveSettings)
    ) {
      void chrome.storage.session
        .set({ [storageKey]: liveSettings })
        .catch(() => {});
    }

    renderAdditionalBilibiliSource(sourceToRender);
    if (
      util.isRecord(sourceToRender) &&
      (typeof sourceToRender.error === "string" ||
        sourceToRender.error === null) &&
      typeof sourceToRender.errorRevision === "number" &&
      Number.isInteger(sourceToRender.errorRevision)
    )
      updateAdditionalSourceError(
        sourceToRender.error,
        sourceToRender.errorRevision,
      );
    else setAdditionalSourceLoadError(storageReadError ?? sourceMessageError);
  } catch {
    if (
      revision === additionalSourceSaveRevision &&
      !additionalBilibiliSourceEdited
    ) {
      renderAdditionalBilibiliSource(null);
      setAdditionalSourceLoadError(t("popupAdditionalDanmakuLoadFailed"));
    }
  }
}

function queueAdditionalBilibiliSourceUpdate(source: {
  enabled: boolean;
  url: string;
  offsetSeconds: number;
}): Promise<unknown> {
  const request = additionalSourceSaveQueue.then(async () => {
    const saved = await sendAdditionalDanmakuMessage({
      type: "SET_ADDITIONAL_DANMAKU_SOURCE",
      source,
    });
    const tabId = additionalBilibiliTabId;
    const settings = parseAdditionalBilibiliSource(saved) ?? source;
    if (tabId !== undefined)
      await chrome.storage.session.set({
        [additionalBilibiliSourceStorageKey(tabId)]: settings,
      });
    return saved;
  });
  additionalSourceSaveQueue = request.then(
    () => {},
    () => {},
  );
  return request;
}

async function disableAdditionalSourceForInvalidSettings(
  revision: number,
  url: string,
  offsetSeconds: number,
  errorField: "url" | "offset",
): Promise<void> {
  additionalBilibiliEnabled.checked = false;
  const validationError =
    errorField === "url"
      ? t("popupAdditionalDanmakuInvalidUrl")
      : t("popupAdditionalDanmakuInvalidOffset");
  try {
    await queueAdditionalBilibiliSourceUpdate({
      enabled: false,
      url: errorField === "url" ? "" : url,
      offsetSeconds,
    });
    if (revision === additionalSourceSaveRevision)
      setAdditionalBilibiliInputError(errorField, validationError);
  } catch {
    if (revision === additionalSourceSaveRevision)
      setAdditionalBilibiliInputError(
        errorField,
        `${validationError} ${t("popupAdditionalDanmakuDisableFailed")}`,
      );
  }
}

async function saveAdditionalBilibiliSource(): Promise<void> {
  const revision = ++additionalSourceSaveRevision;
  setAdditionalBilibiliInputError("url", null);
  setAdditionalBilibiliInputError("offset", null);
  const rawUrl = additionalBilibiliUrl.value.trim();
  let url = "";
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (
        !util.isValidAdditionalDanmakuSourceUrl(parsed.href) ||
        (parsed.hostname === "ani.gamer.com.tw" &&
          Number(parsed.searchParams.get("sn")) <= 0)
      )
        throw new Error("invalid URL");
      url = parsed.href;
    } catch {
      const currentOffset = Number(additionalBilibiliOffset.value);
      const safeOffset =
        Number.isFinite(currentOffset) && Math.abs(currentOffset) <= 3600
          ? currentOffset
          : 0;
      await disableAdditionalSourceForInvalidSettings(
        revision,
        rawUrl,
        safeOffset,
        "url",
      );
      return;
    }
  }

  const offsetSeconds = Number(additionalBilibiliOffset.value);
  if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 3600) {
    await disableAdditionalSourceForInvalidSettings(revision, url, 0, "offset");
    return;
  }
  const enabled = additionalBilibiliEnabled.checked && Boolean(url);
  const source = { enabled, url, offsetSeconds };
  try {
    const saved = await queueAdditionalBilibiliSourceUpdate(source);
    if (revision !== additionalSourceSaveRevision) return;
    renderAdditionalBilibiliSource(saved);
  } catch {
    if (revision === additionalSourceSaveRevision)
      setAdditionalBilibiliInputError(
        "url",
        t("popupAdditionalDanmakuSaveFailed"),
      );
  }
}

additionalBilibiliUrl.addEventListener("input", () => {
  additionalBilibiliSourceEdited = true;
  clearAdditionalSourceLoadError();
});
additionalBilibiliOffset.addEventListener("input", () => {
  additionalBilibiliSourceEdited = true;
});
void loadAdditionalBilibiliSource();
additionalBilibiliUrl.addEventListener("change", () => {
  void saveAdditionalBilibiliSource();
});
additionalBilibiliOffset.addEventListener("change", () => {
  void saveAdditionalBilibiliSource();
});
additionalBilibiliEnabled.addEventListener("change", () => {
  void saveAdditionalBilibiliSource();
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    !util.isExtensionMessage(message) ||
    sender.tab?.id !== additionalBilibiliTabId
  )
    return;
  if (message.type === "ADDITIONAL_DANMAKU_SOURCE_STATUS") {
    updateAdditionalSourceError(message.error, message.revision);
    return;
  }
  if (message.type === "ADDITIONAL_DANMAKU_SOURCE_CHANGED") {
    additionalBilibiliEnabled.checked = message.source.enabled;
    setAdditionalBilibiliAvailability(message.available);
  }
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

type SubtitleVariant = "primary" | "secondary";
type SubtitleNumericKey =
  "fontWeight" | "lineHeightScale" | "fontSizeScale" | "edgeIntensity";
const subtitleVariants: SubtitleVariant[] = ["primary", "secondary"];
const subtitlePreview = document.querySelector(
  "#subtitle-preview",
) as HTMLElement;
const subtitlePreviewSegments = {
  primary: document.querySelector("#subtitle-preview-primary") as HTMLElement,
  secondary: document.querySelector(
    "#subtitle-preview-secondary",
  ) as HTMLElement,
};
const subtitleStyles: Record<SubtitleVariant, SubtitleStyleSettings> = {
  primary: { ...popupSubtitleSettings.DEFAULTS },
  secondary: { ...popupSubtitleSettings.SECONDARY_DEFAULTS },
};
const subtitleStyleRevisions: Record<SubtitleVariant, number> = {
  primary: 0,
  secondary: 0,
};
const subtitleStyleDirty: Record<SubtitleVariant, boolean> = {
  primary: false,
  secondary: false,
};
const subtitleStyleSaveQueues: Record<SubtitleVariant, Promise<void>> = {
  primary: Promise.resolve(),
  secondary: Promise.resolve(),
};
const subtitleStyleSaveTimers: Partial<
  Record<SubtitleVariant, ReturnType<typeof setTimeout>>
> = {};
let subtitleLayout = { ...popupSubtitleSettings.LAYOUT_DEFAULTS };
let subtitleLayoutRevision = 0;
let subtitleLayoutDirty = false;
let subtitleLayoutSaveQueue: Promise<void> = Promise.resolve();
let subtitleLayoutSaveTimer: ReturnType<typeof setTimeout> | undefined;
let activeSubtitleVariant: SubtitleVariant = "primary";

function subtitleStyleStorageKey(variant: SubtitleVariant) {
  return variant === "primary"
    ? popupSubtitleSettings.STORAGE_KEY
    : popupSubtitleSettings.SECONDARY_STORAGE_KEY;
}

function querySubtitleElement(
  variant: SubtitleVariant,
  suffix: string,
): HTMLInputElement | HTMLSelectElement | HTMLOutputElement {
  return document.querySelector(`#${variant}-subtitle-${suffix}`) as
    HTMLInputElement | HTMLSelectElement | HTMLOutputElement;
}

function subtitleNumericControls(variant: SubtitleVariant) {
  const controls: [SubtitleNumericKey, string][] = [
    ["fontSizeScale", "size"],
    ["fontWeight", "font-weight"],
    ["lineHeightScale", "line-height"],
    ["edgeIntensity", "edge-intensity"],
  ];
  return controls.map(([key, suffix]) => ({
    key: key as SubtitleNumericKey,
    input: querySubtitleElement(variant, suffix) as HTMLInputElement,
    output: querySubtitleElement(
      variant,
      `${suffix}-value`,
    ) as HTMLOutputElement,
  }));
}

function renderSubtitlePreview() {
  popupSubtitleSettings.applyLayout(subtitlePreview, subtitleLayout);
  for (const variant of subtitleVariants)
    popupSubtitleSettings.apply(
      subtitlePreviewSegments[variant],
      subtitleStyles[variant],
    );
}

function renderSubtitleVariant(variant: SubtitleVariant) {
  const style = subtitleStyles[variant];
  const fontFamily = querySubtitleElement(
    variant,
    "font-family",
  ) as HTMLSelectElement;
  const textColor = querySubtitleElement(
    variant,
    "text-color",
  ) as HTMLInputElement;
  const edgeStyle = querySubtitleElement(
    variant,
    "edge-style",
  ) as HTMLSelectElement;
  const edgeColor = querySubtitleElement(
    variant,
    "edge-color",
  ) as HTMLInputElement;
  for (const control of subtitleNumericControls(variant)) {
    const value = style[control.key];
    control.input.value = String(value);
    control.output.value =
      control.key === "edgeIntensity"
        ? String(value)
        : control.key === "fontWeight"
          ? String(value)
          : `${value}%`;
  }
  fontFamily.value = style.fontFamily;
  textColor.value = style.textColor;
  edgeStyle.value = style.edgeStyle;
  edgeColor.value = style.edgeColor;
  edgeColor.disabled = style.edgeStyle === "none";
  const edgeEnabled = style.edgeStyle !== "none";
  const edgeIntensityControl = querySubtitleElement(
    variant,
    "edge-intensity",
  ) as HTMLInputElement;
  edgeIntensityControl.disabled = !edgeEnabled;
  const edgeIntensityRow = document.querySelector(
    `[data-subtitle-edge-intensity-row="${variant}"]`,
  ) as HTMLElement;
  edgeIntensityRow.hidden = !edgeEnabled;
}

function renderSubtitleLayout() {
  const backgroundColor = document.querySelector(
    "#subtitle-layout-background-color",
  ) as HTMLInputElement;
  const backgroundOpacity = document.querySelector(
    "#subtitle-layout-background-opacity",
  ) as HTMLInputElement;
  const backgroundOpacityValue = document.querySelector(
    "#subtitle-layout-background-opacity-value",
  ) as HTMLOutputElement;
  const pairGap = document.querySelector(
    "#subtitle-layout-pair-gap",
  ) as HTMLInputElement;
  const pairGapValue = document.querySelector(
    "#subtitle-layout-pair-gap-value",
  ) as HTMLOutputElement;
  const letterSpacing = document.querySelector(
    "#subtitle-layout-letter-spacing",
  ) as HTMLInputElement;
  const letterSpacingValue = document.querySelector(
    "#subtitle-layout-letter-spacing-value",
  ) as HTMLOutputElement;
  const position = document.querySelector(
    "#subtitle-layout-position",
  ) as HTMLInputElement;
  const positionValue = document.querySelector(
    "#subtitle-layout-position-value",
  ) as HTMLOutputElement;
  backgroundColor.value = subtitleLayout.backgroundColor;
  backgroundOpacity.value = String(subtitleLayout.backgroundOpacity);
  backgroundOpacityValue.value = `${subtitleLayout.backgroundOpacity}%`;
  pairGap.value = String(subtitleLayout.pairGap);
  pairGapValue.value = `${(subtitleLayout.pairGap / 100).toFixed(2)}em`;
  letterSpacing.value = String(subtitleLayout.letterSpacing);
  letterSpacingValue.value = `${(subtitleLayout.letterSpacing / 100).toFixed(2)}em`;
  position.value = String(subtitleLayout.bottomOffset);
  positionValue.value = `${subtitleLayout.bottomOffset}%`;
}

function renderSubtitleStyle() {
  for (const variant of subtitleVariants) renderSubtitleVariant(variant);
  renderSubtitleLayout();
  renderSubtitlePreview();
}

function setSubtitleStyleControlsDisabled(disabled: boolean) {
  for (const variant of subtitleVariants) {
    for (const control of subtitleNumericControls(variant))
      control.input.disabled = disabled;
    for (const suffix of [
      "font-family",
      "text-color",
      "edge-style",
      "edge-color",
    ])
      (
        querySubtitleElement(variant, suffix) as
          HTMLInputElement | HTMLSelectElement
      ).disabled = disabled;
  }
  for (const id of [
    "subtitle-layout-background-color",
    "subtitle-layout-background-opacity",
    "subtitle-layout-pair-gap",
    "subtitle-layout-letter-spacing",
    "subtitle-layout-position",
    "subtitle-layout-reset",
    "subtitle-style-reset-current",
  ])
    (
      document.querySelector(`#${id}`) as HTMLInputElement | HTMLButtonElement
    ).disabled = disabled;
}

function updateSubtitleVariant(variant: SubtitleVariant, value: unknown) {
  subtitleStyles[variant] = popupSubtitleSettings.normalize(
    value,
    variant === "primary"
      ? popupSubtitleSettings.DEFAULTS
      : popupSubtitleSettings.SECONDARY_DEFAULTS,
  );
  subtitleStyleRevisions[variant]++;
  subtitleStyleDirty[variant] = true;
  renderSubtitleStyle();
}

function updateSubtitleLayout(value: unknown) {
  subtitleLayout = popupSubtitleSettings.normalizeLayout(value);
  subtitleLayoutRevision++;
  subtitleLayoutDirty = true;
  renderSubtitleStyle();
}

function saveSubtitleVariant(variant: SubtitleVariant) {
  const style = { ...subtitleStyles[variant] };
  const revision = subtitleStyleRevisions[variant];
  const save = subtitleStyleSaveQueues[variant].then(() =>
    chrome.storage.local.set({ [subtitleStyleStorageKey(variant)]: style }),
  );
  subtitleStyleSaveQueues[variant] = save.catch(() => {});
  void save.then(
    () => {
      if (revision === subtitleStyleRevisions[variant])
        subtitleStyleDirty[variant] = false;
      showStatus("");
    },
    () => showStatus(t("popupCannotSaveSubtitle"), true),
  );
}

function scheduleSubtitleVariantSave(variant: SubtitleVariant) {
  const timer = subtitleStyleSaveTimers[variant];
  if (timer) clearTimeout(timer);
  subtitleStyleSaveTimers[variant] = setTimeout(() => {
    delete subtitleStyleSaveTimers[variant];
    saveSubtitleVariant(variant);
  }, 120);
}

function saveSubtitleLayout() {
  const layout = { ...subtitleLayout };
  const revision = subtitleLayoutRevision;
  const save = subtitleLayoutSaveQueue.then(() =>
    chrome.storage.local.set({
      [popupSubtitleSettings.LAYOUT_STORAGE_KEY]: layout,
    }),
  );
  subtitleLayoutSaveQueue = save.catch(() => {});
  void save.then(
    () => {
      if (revision === subtitleLayoutRevision) subtitleLayoutDirty = false;
      showStatus("");
    },
    () => showStatus(t("popupCannotSaveSubtitle"), true),
  );
}

function scheduleSubtitleLayoutSave() {
  if (subtitleLayoutSaveTimer) clearTimeout(subtitleLayoutSaveTimer);
  subtitleLayoutSaveTimer = setTimeout(() => {
    subtitleLayoutSaveTimer = undefined;
    saveSubtitleLayout();
  }, 120);
}

async function loadSubtitleStyle() {
  try {
    const stored = await chrome.storage.local.get([
      popupSubtitleSettings.STORAGE_KEY,
      popupSubtitleSettings.SECONDARY_STORAGE_KEY,
      popupSubtitleSettings.LAYOUT_STORAGE_KEY,
    ]);
    const primaryScrubbed = popupSubtitleSettings.scrubOrphanedStyleFields(
      stored[popupSubtitleSettings.STORAGE_KEY],
      popupSubtitleSettings.normalize(
        stored[popupSubtitleSettings.STORAGE_KEY],
      ),
    );
    subtitleStyles.primary = primaryScrubbed.style;
    if (primaryScrubbed.changed)
      void chrome.storage.local.set({
        [popupSubtitleSettings.STORAGE_KEY]: primaryScrubbed.style,
      });
    const secondaryScrubbed = popupSubtitleSettings.scrubOrphanedStyleFields(
      stored[popupSubtitleSettings.SECONDARY_STORAGE_KEY],
      popupSubtitleSettings.normalize(
        stored[popupSubtitleSettings.SECONDARY_STORAGE_KEY],
        popupSubtitleSettings.SECONDARY_DEFAULTS,
      ),
    );
    subtitleStyles.secondary = secondaryScrubbed.style;
    if (secondaryScrubbed.changed)
      void chrome.storage.local.set({
        [popupSubtitleSettings.SECONDARY_STORAGE_KEY]: secondaryScrubbed.style,
      });
    subtitleLayout = popupSubtitleSettings.normalizeLayout(
      stored[popupSubtitleSettings.LAYOUT_STORAGE_KEY] ??
        stored[popupSubtitleSettings.STORAGE_KEY],
    );
  } catch {
    subtitleStyles.primary = { ...popupSubtitleSettings.DEFAULTS };
    subtitleStyles.secondary = { ...popupSubtitleSettings.SECONDARY_DEFAULTS };
    subtitleLayout = { ...popupSubtitleSettings.LAYOUT_DEFAULTS };
  }
  setSubtitleStyleControlsDisabled(false);
  renderSubtitleStyle();
}

function bindSubtitleVariantControls(variant: SubtitleVariant) {
  for (const control of subtitleNumericControls(variant)) {
    control.input.addEventListener("input", () => {
      updateSubtitleVariant(variant, {
        ...subtitleStyles[variant],
        [control.key]: Number(control.input.value),
      });
      scheduleSubtitleVariantSave(variant);
    });
    control.input.addEventListener("change", () => {
      const timer = subtitleStyleSaveTimers[variant];
      if (timer) clearTimeout(timer);
      delete subtitleStyleSaveTimers[variant];
      saveSubtitleVariant(variant);
    });
  }
  for (const [suffix, key] of [
    ["font-family", "fontFamily"],
    ["text-color", "textColor"],
    ["edge-style", "edgeStyle"],
    ["edge-color", "edgeColor"],
  ] as const) {
    const input = querySubtitleElement(variant, suffix) as
      HTMLInputElement | HTMLSelectElement;
    input.addEventListener("input", () => {
      updateSubtitleVariant(variant, {
        ...subtitleStyles[variant],
        [key]: input.value,
      });
      scheduleSubtitleVariantSave(variant);
    });
    input.addEventListener("change", () => saveSubtitleVariant(variant));
  }
}

for (const variant of subtitleVariants) bindSubtitleVariantControls(variant);
for (const tab of ["primary", "secondary"] as const) {
  const tabElement = document.querySelector(
    `[data-subtitle-tab="${tab}"]`,
  ) as HTMLButtonElement;
  tabElement.addEventListener("click", () => {
    activeSubtitleVariant = tab;
    for (const candidate of ["primary", "secondary"] as const) {
      const candidateTab = document.querySelector(
        `[data-subtitle-tab="${candidate}"]`,
      ) as HTMLButtonElement;
      const candidatePanel = document.querySelector(
        `[data-subtitle-panel="${candidate}"]`,
      ) as HTMLElement;
      const active = candidate === activeSubtitleVariant;
      candidateTab.classList.toggle("is-active", active);
      candidateTab.setAttribute("aria-selected", String(active));
      candidatePanel.hidden = !active;
    }
  });
}
const subtitleLayoutBackgroundColor = document.querySelector(
  "#subtitle-layout-background-color",
) as HTMLInputElement;
const subtitleLayoutBackgroundOpacity = document.querySelector(
  "#subtitle-layout-background-opacity",
) as HTMLInputElement;
const subtitleLayoutPairGap = document.querySelector(
  "#subtitle-layout-pair-gap",
) as HTMLInputElement;
const subtitleLayoutLetterSpacing = document.querySelector(
  "#subtitle-layout-letter-spacing",
) as HTMLInputElement;
const subtitleLayoutPosition = document.querySelector(
  "#subtitle-layout-position",
) as HTMLInputElement;
for (const [input, key] of [
  [subtitleLayoutBackgroundColor, "backgroundColor"],
  [subtitleLayoutBackgroundOpacity, "backgroundOpacity"],
  [subtitleLayoutPairGap, "pairGap"],
  [subtitleLayoutLetterSpacing, "letterSpacing"],
  [subtitleLayoutPosition, "bottomOffset"],
] as const) {
  input.addEventListener("input", () => {
    updateSubtitleLayout({
      ...subtitleLayout,
      [key]: key === "backgroundColor" ? input.value : Number(input.value),
    });
    scheduleSubtitleLayoutSave();
  });
  input.addEventListener("change", () => saveSubtitleLayout());
}
(
  document.querySelector("#subtitle-style-reset-current") as HTMLButtonElement
).addEventListener("click", () => {
  updateSubtitleVariant(
    activeSubtitleVariant,
    activeSubtitleVariant === "primary"
      ? popupSubtitleSettings.DEFAULTS
      : popupSubtitleSettings.SECONDARY_DEFAULTS,
  );
  saveSubtitleVariant(activeSubtitleVariant);
});
(
  document.querySelector("#subtitle-layout-reset") as HTMLButtonElement
).addEventListener("click", () => {
  updateSubtitleLayout({ ...popupSubtitleSettings.LAYOUT_DEFAULTS });
  saveSubtitleLayout();
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

  for (const variant of subtitleVariants) {
    const subtitleChange = changes[subtitleStyleStorageKey(variant)];
    if (!subtitleChange || subtitleStyleDirty[variant]) continue;
    subtitleStyles[variant] = popupSubtitleSettings.normalize(
      subtitleChange.newValue,
      variant === "primary"
        ? popupSubtitleSettings.DEFAULTS
        : popupSubtitleSettings.SECONDARY_DEFAULTS,
    );
    subtitleStyleRevisions[variant]++;
    renderSubtitleStyle();
  }
  const subtitleLayoutChange =
    changes[popupSubtitleSettings.LAYOUT_STORAGE_KEY];
  if (subtitleLayoutChange && !subtitleLayoutDirty) {
    subtitleLayout = popupSubtitleSettings.normalizeLayout(
      subtitleLayoutChange.newValue,
    );
    subtitleLayoutRevision++;
    renderSubtitleStyle();
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

setDanmakuStyleControlsDisabled(true);
setSubtitleStyleControlsDisabled(true);
renderDanmakuStyle();
renderSubtitleStyle();
void loadToggles();
void loadLaunchShortcut();
void loadDanmakuStyle();
void loadSubtitleStyle();
void syncPipState();
