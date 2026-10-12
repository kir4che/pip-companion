"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.util = (() => {
  const SHORTCUT_DEFAULTS: Record<ShortcutKey, Shortcut> = {
    launchShortcut: {
      code: "KeyP",
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
    },
    commentsShortcut: {
      code: "KeyC",
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    },
    screenshotShortcut: {
      code: "KeyP",
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    },
    danmakuShortcut: {
      code: "KeyD",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
  };
  const SHORTCUT_KEYS: ShortcutKey[] = [
    "launchShortcut",
    "commentsShortcut",
    "screenshotShortcut",
    "danmakuShortcut",
  ];
  const DEFAULT_SEEK_SECONDS: SeekSeconds = 5;
  const SEEK_SECONDS_OPTIONS = [
    1, 3, 5, 10, 15, 30,
  ] as const satisfies readonly SeekSeconds[];

  function isSeekSeconds(value: unknown): value is SeekSeconds {
    return (
      typeof value === "number" &&
      SEEK_SECONDS_OPTIONS.some((seconds) => seconds === value)
    );
  }

  function normalizeSeekSeconds(value: unknown): SeekSeconds {
    return isSeekSeconds(value) ? value : DEFAULT_SEEK_SECONDS;
  }

  type Locale = "en" | "zh_TW" | "zh_CN";
  type LanguagePreference = "auto" | Locale;
  let languagePreference: LanguagePreference = "auto";

  function getLocale(): Locale {
    if (languagePreference !== "auto") return languagePreference;
    const locale = chrome.i18n.getUILanguage().replaceAll("-", "_");
    if (
      locale === "zh_TW" ||
      locale.startsWith("zh_Hant") ||
      locale.startsWith("zh_HK") ||
      locale.startsWith("zh_MO")
    )
      return "zh_TW";
    if (locale === "zh_CN" || locale.startsWith("zh_Hans")) return "zh_CN";
    return "en";
  }

  function setLanguagePreference(value: unknown): LanguagePreference {
    languagePreference =
      value === "en" || value === "zh_TW" || value === "zh_CN" ? value : "auto";
    return languagePreference;
  }

  function getHtmlLanguage() {
    const locale = getLocale();
    return locale === "zh_TW"
      ? "zh-Hant"
      : locale === "zh_CN"
        ? "zh-Hans"
        : "en";
  }

  function getMessage(key: string, substitutions?: string | string[]) {
    const message =
      globalThis.PipCompanion.locales[getLocale()]?.[key]?.message;
    if (message === undefined)
      return chrome.i18n.getMessage(key, substitutions);
    const values = Array.isArray(substitutions)
      ? substitutions
      : substitutions === undefined
        ? []
        : [substitutions];
    return message.replace(
      /\$(\d+)/g,
      (placeholder, index: string) => values[Number(index) - 1] ?? placeholder,
    );
  }

  const pin = (label: string, code: string, shift = false) => ({
    label,
    shortcut: { code, ctrl: false, alt: false, shift, meta: false },
  });

  function getFixedShortcuts(): { label: string; shortcut: Shortcut }[] {
    return [
      pin(getMessage("shortcutPlayPause"), "Space"),
      pin(getMessage("shortcutCaptions"), "KeyC"),
      pin(getMessage("shortcutMute"), "KeyM"),
      pin(getMessage("shortcutStepBackward"), "Comma"),
      pin(getMessage("shortcutStepForward"), "Period"),
      pin(getMessage("shortcutSlower"), "Comma", true),
      pin(getMessage("shortcutFaster"), "Period", true),
      pin(getMessage("shortcutRewind"), "ArrowLeft"),
      pin(getMessage("shortcutForward"), "ArrowRight"),
      pin(getMessage("shortcutVolumeUp"), "ArrowUp"),
      pin(getMessage("shortcutVolumeDown"), "ArrowDown"),
      pin(getMessage("shortcutAutoFit"), "KeyR"),
    ];
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isExtensionMessage(value: unknown): value is ExtensionMessage {
    if (!isRecord(value) || typeof value.type !== "string") return false;

    switch (value.type) {
      case "PING":
      case "GET_PIP_STATE":
      case "CLOSE_PIP":
      case "CLOSE_ALL_PIP":
      case "GET_PIP_BOUNDS":
      case "REQUEST_PIP_HANDOFF":
        return true;
      case "OPEN_PIP":
        return true;
      case "SAVE_PIP_BOUNDS":
        return (
          [
            value.innerWidth,
            value.left,
            value.top,
            value.width,
            value.height,
          ].every(
            (number) => typeof number === "number" && Number.isFinite(number),
          ) &&
          typeof value.innerWidth === "number" &&
          value.innerWidth > 0 &&
          typeof value.width === "number" &&
          value.width > 0 &&
          typeof value.height === "number" &&
          value.height > 0
        );
      case "RESTORE_PIP_BOUNDS":
        return (
          typeof value.innerWidth === "number" &&
          Number.isFinite(value.innerWidth) &&
          value.innerWidth > 0
        );
      case "PIP_STATE_CHANGED":
        return (
          typeof value.pipOpen === "boolean" &&
          (value.playing === undefined || typeof value.playing === "boolean")
        );
      case "PIP_GLOBAL_STATE":
        return (
          typeof value.pipOpen === "boolean" &&
          (value.sourcePlaying === undefined ||
            typeof value.sourcePlaying === "boolean")
        );
      case "PIP_SOURCE_PLAYBACK_CHANGED":
        return typeof value.playing === "boolean";
      case "RESIZE_PIP_WINDOW":
        return (
          typeof value.innerWidth === "number" &&
          Number.isFinite(value.innerWidth) &&
          value.innerWidth > 0 &&
          typeof value.width === "number" &&
          Number.isFinite(value.width) &&
          value.width > 0 &&
          typeof value.height === "number" &&
          Number.isFinite(value.height) &&
          value.height > 0
        );
      case "GET_BILIBILI_DANMAKU": {
        const hasBvid = typeof value.bvid === "string";
        const hasAvid = typeof value.avid === "string";
        const onlyBvid = hasBvid && value.avid === undefined;
        const onlyAvid = hasAvid && value.bvid === undefined;
        const page = value.page;
        const startSegment = value.startSegment;
        const endSegment = value.endSegment;
        return (
          (onlyBvid || onlyAvid) &&
          typeof page === "number" &&
          Number.isSafeInteger(page) &&
          page > 0 &&
          (startSegment === undefined ||
            (typeof startSegment === "number" &&
              Number.isSafeInteger(startSegment) &&
              startSegment > 0)) &&
          (endSegment === undefined ||
            (typeof endSegment === "number" &&
              Number.isSafeInteger(endSegment) &&
              endSegment > 0))
        );
      }
      default:
        return false;
    }
  }

  function normalizeShortcut(value: unknown, fallback: Shortcut): Shortcut {
    if (!isRecord(value)) return { ...fallback };

    const shortcut = value;
    return {
      code: typeof shortcut.code === "string" ? shortcut.code : fallback.code,
      ctrl: typeof shortcut.ctrl === "boolean" ? shortcut.ctrl : fallback.ctrl,
      alt: typeof shortcut.alt === "boolean" ? shortcut.alt : fallback.alt,
      shift:
        typeof shortcut.shift === "boolean" ? shortcut.shift : fallback.shift,
      meta: typeof shortcut.meta === "boolean" ? shortcut.meta : fallback.meta,
    };
  }

  function hasMetaModifier(event: KeyboardEvent) {
    return event.metaKey || event.getModifierState("Meta");
  }

  function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut) {
    return (
      event.code === shortcut.code &&
      event.ctrlKey === shortcut.ctrl &&
      event.altKey === shortcut.alt &&
      event.shiftKey === shortcut.shift &&
      hasMetaModifier(event) === shortcut.meta
    );
  }

  function formatShortcut(value: Shortcut, forAria = false) {
    const platform = navigator.platform;
    const isMac = platform.includes("Mac");
    const useMacSymbols = isMac && !forAria;
    const isWindows = platform.includes("Win");
    const parts: string[] = [];
    if (value.ctrl) parts.push(useMacSymbols ? "⌃" : "Ctrl");
    if (value.alt) parts.push(useMacSymbols ? "⌥" : "Alt");
    if (value.shift) parts.push(useMacSymbols ? "⇧" : "Shift");
    if (value.meta) {
      if (isMac) parts.push(forAria ? "Command" : "⌘");
      else if (isWindows) parts.push(forAria ? "Windows" : "Win");
      else parts.push("Meta");
    }

    const key = value.code.startsWith("Key")
      ? value.code.slice(3)
      : value.code.startsWith("Digit")
        ? value.code.slice(5)
        : value.code === "Space"
          ? "Space"
          : value.code;
    parts.push(key);
    return parts.join(useMacSymbols ? "" : "+");
  }

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function parseTime(input: string): number | null {
    const text = input.trim();
    if (!text) return null;

    const parts = text.split(":");
    if (parts.length > 3 || !parts.every((part) => /^\d{1,5}$/.test(part)))
      return null;

    const nums = parts.map(Number);
    const seconds = nums.pop() ?? 0;
    const minutes = nums.pop() ?? 0;
    const hours = nums.pop() ?? 0;

    if (parts.length >= 2 && seconds > 59) return null;
    if (parts.length === 3 && minutes > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return {
    getMessage,
    getLocale,
    getHtmlLanguage,
    setLanguagePreference,
    getLanguagePreference: () => languagePreference,
    SHORTCUT_DEFAULTS,
    SHORTCUT_KEYS,
    DEFAULT_SEEK_SECONDS,
    SEEK_SECONDS_OPTIONS,
    normalizeSeekSeconds,
    isRecord,
    isExtensionMessage,
    getFixedShortcuts,
    normalizeShortcut,
    hasMetaModifier,
    matchesShortcut,
    formatShortcut,
    formatTime,
    parseTime,
  };
})();
