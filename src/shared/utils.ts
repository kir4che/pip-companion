"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.util = (() => {
  const isMac = navigator.platform.includes("Mac");
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
    pipPlayPauseShortcut: {
      code: "Space",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipSeekBackwardShortcut: {
      code: "ArrowLeft",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipSeekForwardShortcut: {
      code: "ArrowRight",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipVolumeDownShortcut: {
      code: "ArrowDown",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipVolumeUpShortcut: {
      code: "ArrowUp",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipToggleSubtitlesShortcut: {
      code: "KeyC",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipMuteShortcut: {
      code: "KeyM",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipFrameStepBackwardShortcut: {
      code: "Comma",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipFrameStepForwardShortcut: {
      code: "Period",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipPlaybackRateDownShortcut: {
      code: "Comma",
      ctrl: false,
      alt: false,
      shift: true,
      meta: false,
    },
    pipPlaybackRateUpShortcut: {
      code: "Period",
      ctrl: false,
      alt: false,
      shift: true,
      meta: false,
    },
    pipDanmakuInputShortcut: {
      code: "Enter",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipAutoFitShortcut: {
      code: "KeyR",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    },
    pipResizeShortcut: {
      code: "Wheel",
      ctrl: !isMac,
      alt: false,
      shift: false,
      meta: isMac,
    },
  };
  const SHORTCUT_KEYS: ShortcutKey[] = Object.keys(
    SHORTCUT_DEFAULTS,
  ) as ShortcutKey[];
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

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  const extensionMessageTypes = new Set([
    "YOUTUBE_CHAT_PROBE",
    "START_EXTRA_YOUTUBE_CHAT",
    "YOUTUBE_CHAT_START",
    "STOP_EXTRA_YOUTUBE_CHAT",
    "YOUTUBE_CHAT_STOP",
    "YOUTUBE_CHAT_CLOCK",
    "EXTRA_YOUTUBE_CHAT_CLOCK",
    "YOUTUBE_CHAT_ENDED",
    "YOUTUBE_CHAT_MESSAGE",
    "EXTRA_YOUTUBE_CHAT_MESSAGE",
    "EXTRA_YOUTUBE_CHAT_STATUS",
    "PING",
    "GET_PIP_STATE",
    "CLOSE_PIP",
    "CLOSE_ALL_PIP",
    "GET_PIP_BOUNDS",
    "REQUEST_PIP_HANDOFF",
    "OPEN_PIP",
    "PIP_STATE_CHANGED",
    "PIP_GLOBAL_STATE",
    "SAVE_PIP_BOUNDS",
    "RESTORE_PIP_BOUNDS",
    "CENTER_PIP_BOUNDS",
    "PIP_SOURCE_PLAYBACK_CHANGED",
    "PIP_SUBTITLES_ENABLED_CHANGED",
    "GET_EXTRA_DANMAKU_SOURCE",
    "EXTRA_DANMAKU_SOURCE_STATUS",
    "EXTRA_DANMAKU_SOURCE_CHANGED",
    "SET_EXTRA_DANMAKU_SOURCE",
    "RESIZE_PIP_WINDOW",
    "GET_BILIBILI_DANMAKU",
    "GET_BAHAMUT_DANMAKU",
    "START_EXTRA_TWITCH_CHAT",
    "STOP_EXTRA_TWITCH_CHAT",
    "EXTRA_TWITCH_CHAT_STATUS",
    "EXTRA_TWITCH_CHAT_MESSAGE",
    "GET_BILIBILI_SUBTITLE_CUES",
    "GET_SUBTITLE_TRANSLATION_LANGUAGES",
    "GET_SUBTITLE_TRANSLATION_SERVICES",
    "SET_SUBTITLE_TRANSLATION_PROVIDER",
    "TRANSLATE_SUBTITLE_CUES",
    "TEST_SUBTITLE_TRANSLATION",
  ]);

  function isKnownExtensionMessageType(value: unknown): value is string {
    return typeof value === "string" && extensionMessageTypes.has(value);
  }

  function isExtensionMessage(value: unknown): value is ExtensionMessage {
    if (!isRecord(value) || typeof value.type !== "string") return false;

    switch (value.type) {
      case "YOUTUBE_CHAT_PROBE":
        return true;
      case "START_EXTRA_YOUTUBE_CHAT":
      case "YOUTUBE_CHAT_START":
      case "STOP_EXTRA_YOUTUBE_CHAT":
      case "YOUTUBE_CHAT_STOP":
      case "YOUTUBE_CHAT_ENDED":
      case "EXTRA_YOUTUBE_CHAT_CLOCK":
      case "YOUTUBE_CHAT_CLOCK":
      case "YOUTUBE_CHAT_MESSAGE":
      case "EXTRA_YOUTUBE_CHAT_MESSAGE":
      case "EXTRA_YOUTUBE_CHAT_STATUS": {
        if (
          typeof value.connectionId !== "string" ||
          !/^[\w-]{1,100}$/.test(value.connectionId)
        )
          return false;
        if (
          value.type === "START_EXTRA_YOUTUBE_CHAT" ||
          value.type === "YOUTUBE_CHAT_START"
        )
          return (
            typeof value.videoId === "string" &&
            /^[\w-]{11}$/.test(value.videoId)
          );
        if (
          value.type === "STOP_EXTRA_YOUTUBE_CHAT" ||
          value.type === "YOUTUBE_CHAT_STOP" ||
          value.type === "YOUTUBE_CHAT_ENDED"
        )
          return true;
        if (value.type === "EXTRA_YOUTUBE_CHAT_STATUS")
          return (
            typeof value.videoId === "string" &&
            /^[\w-]{11}$/.test(value.videoId) &&
            value.status === "error" &&
            typeof value.error === "string" &&
            value.error.length <= 2000
          );
        if (
          !Number.isSafeInteger(value.seekRevision) ||
          (value.seekRevision as number) < 0
        )
          return false;
        if (
          value.type === "EXTRA_YOUTUBE_CHAT_CLOCK" ||
          value.type === "YOUTUBE_CHAT_CLOCK"
        )
          return (
            typeof value.time === "number" &&
            Number.isFinite(value.time) &&
            value.time >= 0 &&
            value.time <= 1e8 &&
            typeof value.paused === "boolean" &&
            typeof value.ended === "boolean"
          );
        return (
          (value.type !== "EXTRA_YOUTUBE_CHAT_MESSAGE" ||
            (typeof value.videoId === "string" &&
              /^[\w-]{11}$/.test(value.videoId))) &&
          isRecord(value.data) &&
          typeof value.data.text === "string" &&
          value.data.text.length <= 2000 &&
          JSON.stringify(value.data).length <= 32768
        );
      }
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
      case "CENTER_PIP_BOUNDS":
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
          (value.playing === undefined || typeof value.playing === "boolean") &&
          (value.subtitlesEnabled === undefined ||
            typeof value.subtitlesEnabled === "boolean")
        );
      case "PIP_GLOBAL_STATE":
        return (
          typeof value.pipOpen === "boolean" &&
          (value.sourcePlaying === undefined ||
            typeof value.sourcePlaying === "boolean")
        );
      case "PIP_SOURCE_PLAYBACK_CHANGED":
        return typeof value.playing === "boolean";
      case "PIP_SUBTITLES_ENABLED_CHANGED":
        return typeof value.enabled === "boolean";
      case "GET_EXTRA_DANMAKU_SOURCE":
        return true;
      case "GET_BAHAMUT_DANMAKU":
        return (
          typeof value.videoSn === "string" &&
          /^\d{1,12}$/.test(value.videoSn) &&
          Number(value.videoSn) > 0
        );
      case "START_EXTRA_TWITCH_CHAT":
        return (
          typeof value.channel === "string" &&
          /^[a-z0-9_]{1,25}$/i.test(value.channel)
        );
      case "STOP_EXTRA_TWITCH_CHAT":
        return true;
      case "EXTRA_TWITCH_CHAT_STATUS":
        return (
          typeof value.channel === "string" &&
          /^[a-z0-9_]{1,25}$/i.test(value.channel) &&
          typeof value.connectionId === "string" &&
          value.connectionId.length <= 100 &&
          (value.status === "connected" || value.status === "error") &&
          (value.error === undefined || typeof value.error === "string")
        );
      case "EXTRA_TWITCH_CHAT_MESSAGE":
        return (
          typeof value.channel === "string" &&
          /^[a-z0-9_]{1,25}$/i.test(value.channel) &&
          typeof value.connectionId === "string" &&
          value.connectionId.length <= 100 &&
          isRecord(value.data) &&
          typeof value.data.text === "string" &&
          value.data.text.length <= 2000
        );
      case "EXTRA_DANMAKU_SOURCE_STATUS":
        return (
          (value.error === null || typeof value.error === "string") &&
          (value.loading === undefined || typeof value.loading === "boolean") &&
          typeof value.revision === "number" &&
          Number.isInteger(value.revision) &&
          value.revision >= 0
        );
      case "EXTRA_DANMAKU_SOURCE_CHANGED":
        return (
          isRecord(value.source) &&
          typeof value.source.enabled === "boolean" &&
          typeof value.source.url === "string" &&
          value.source.url.length <= 2048 &&
          (value.source.url === "" ||
            globalThis.PipCompanion.isValidExtraDanmakuSourceUrl(
              value.source.url,
            )) &&
          (!value.source.enabled || value.source.url !== "") &&
          typeof value.source.offsetSeconds === "number" &&
          Number.isFinite(value.source.offsetSeconds) &&
          Math.abs(value.source.offsetSeconds) <= 3600 &&
          typeof value.available === "boolean"
        );
      case "SET_EXTRA_DANMAKU_SOURCE":
        return (
          isRecord(value.source) &&
          typeof value.source.enabled === "boolean" &&
          typeof value.source.url === "string" &&
          value.source.url.length <= 2048 &&
          (value.source.url === "" ||
            globalThis.PipCompanion.isValidExtraDanmakuSourceUrl(
              value.source.url,
            )) &&
          (!value.source.enabled || value.source.url !== "") &&
          typeof value.source.offsetSeconds === "number" &&
          Number.isFinite(value.source.offsetSeconds) &&
          Math.abs(value.source.offsetSeconds) <= 3600
        );
      case "GET_BILIBILI_SUBTITLE_CUES":
        return typeof value.url === "string" && value.url.length <= 8192;
      case "GET_SUBTITLE_TRANSLATION_LANGUAGES":
      case "GET_SUBTITLE_TRANSLATION_SERVICES":
        return true;
      case "SET_SUBTITLE_TRANSLATION_PROVIDER":
        return (
          value.provider === "microsoft" ||
          value.provider === "google" ||
          value.provider === "deepl"
        );
      case "TRANSLATE_SUBTITLE_CUES":
        return (
          typeof value.targetLanguage === "string" &&
          value.targetLanguage.length <= 64 &&
          Array.isArray(value.texts) &&
          value.texts.length <= 100 &&
          value.texts.every(
            (text) => typeof text === "string" && text.length <= 2000,
          )
        );
      case "TEST_SUBTITLE_TRANSLATION":
        return (
          (value.provider === "microsoft" ||
            value.provider === "google" ||
            value.provider === "deepl") &&
          isRecord(value.config)
        );
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
        const validVideoId = hasBvid
          ? /^BV[\w]{10}$/i.test(value.bvid as string)
          : typeof value.avid === "string" && /^\d+$/.test(value.avid);
        const page = value.page;
        const startSegment = value.startSegment;
        const endSegment = value.endSegment;
        const validRange =
          startSegment === undefined || endSegment === undefined
            ? true
            : (endSegment as number) >= (startSegment as number) &&
              (endSegment as number) - (startSegment as number) <= 5;
        return (
          (onlyBvid || onlyAvid) &&
          validVideoId &&
          typeof page === "number" &&
          Number.isSafeInteger(page) &&
          page > 0 &&
          page <= 1000 &&
          validRange &&
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
      shortcut.code !== "" &&
      event.code === shortcut.code &&
      event.ctrlKey === shortcut.ctrl &&
      event.altKey === shortcut.alt &&
      event.shiftKey === shortcut.shift &&
      hasMetaModifier(event) === shortcut.meta
    );
  }

  function matchesWheelShortcut(event: WheelEvent, shortcut: Shortcut) {
    return (
      shortcut.code === "Wheel" &&
      event.ctrlKey === shortcut.ctrl &&
      event.altKey === shortcut.alt &&
      event.shiftKey === shortcut.shift &&
      (event.metaKey || event.getModifierState("Meta")) === shortcut.meta
    );
  }

  function formatShortcut(value: Shortcut, forAria = false, spaced = false) {
    if (value.code === "")
      return forAria ? "" : getMessage("popupShortcutUnassigned");

    const platform = navigator.platform;
    const isMac = platform.includes("Mac");
    const useMacSymbols = isMac && !forAria;
    const isWindows = platform.includes("Win");
    const parts: string[] = [];
    if (value.shift) parts.push(useMacSymbols ? "⇧" : "Shift");
    if (value.ctrl)
      parts.push(forAria ? "Control" : useMacSymbols ? "⌃" : "Ctrl");
    if (value.alt) parts.push(useMacSymbols ? "⌥" : "Alt");
    if (value.meta) {
      if (forAria) parts.push("Meta");
      else if (isMac) parts.push("⌘");
      else if (isWindows) parts.push("Win");
      else parts.push("Meta");
    }

    const keyLabels: Record<string, string> = {
      ArrowDown: forAria ? "ArrowDown" : "↓",
      ArrowLeft: forAria ? "ArrowLeft" : "←",
      ArrowRight: forAria ? "ArrowRight" : "→",
      ArrowUp: forAria ? "ArrowUp" : "↑",
      Wheel: forAria ? "Wheel" : getMessage("popupWheel"),
      Comma: ",",
      Period: ".",
    };
    const key =
      keyLabels[value.code] ??
      (value.code.startsWith("Key")
        ? value.code.slice(3)
        : value.code.startsWith("Digit")
          ? value.code.slice(5)
          : value.code === "Space"
            ? "Space"
            : value.code);
    parts.push(key);
    return parts.join(
      forAria ? "+" : spaced ? " + " : useMacSymbols ? "" : "+",
    );
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
    isKnownExtensionMessageType,
    isValidExtraDanmakuSourceUrl:
      globalThis.PipCompanion.isValidExtraDanmakuSourceUrl,
    isExtensionMessage,
    normalizeShortcut,
    hasMetaModifier,
    matchesShortcut,
    matchesWheelShortcut,
    formatShortcut,
    formatTime,
    parseTime,
  };
})();

type RuntimeMessageHandler = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void | Promise<boolean | void>;
type RuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;
type RuntimeMessageRegistrar = (listener: RuntimeMessageListener) => void;
type RuntimeMessageAuthorizer = (
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
) => boolean;

function createRuntimeMessageDispatcher(
  register: RuntimeMessageRegistrar,
  authorize?: RuntimeMessageAuthorizer,
): RuntimeMessageDispatcher {
  const handlers = new Map<string, Set<RuntimeMessageHandler>>();
  register((message, sender, sendResponse) => {
    if (!globalThis.PipCompanion.util.isExtensionMessage(message)) {
      if (
        globalThis.PipCompanion.util.isRecord(message) &&
        typeof message.type === "string" &&
        globalThis.PipCompanion.util.isKnownExtensionMessageType(message.type)
      )
        sendResponse({ ok: false, error: "Invalid message" });
      return false;
    }
    if (authorize && !authorize(message as Record<string, unknown>, sender)) {
      sendResponse({ ok: false, error: "Unsupported request sender" });
      return false;
    }

    let responseSent = false;
    const respondOnce = (response?: unknown) => {
      if (responseSent) return;
      responseSent = true;
      sendResponse(response);
    };
    let keepChannelOpen = false;
    for (const registeredHandler of handlers.get(message.type) ?? []) {
      try {
        const result = registeredHandler(message, sender, respondOnce);
        if (result === true) keepChannelOpen = true;
        else if (result && typeof result === "object" && "then" in result) {
          keepChannelOpen = true;
          void Promise.resolve(result).catch((error: unknown) => {
            console.error("[PiP Companion] Message handler failed:", error);
            respondOnce({ ok: false });
          });
        }
      } catch (error) {
        console.error("[PiP Companion] Message handler failed:", error);
        respondOnce({ ok: false });
      }
    }
    return keepChannelOpen;
  });

  return {
    addListener(types, handler) {
      for (const type of typeof types === "string" ? [types] : types) {
        const typeHandlers = handlers.get(type) ?? new Set();
        typeHandlers.add(handler);
        handlers.set(type, typeHandlers);
      }
    },
  };
}

globalThis.PipCompanion.createRuntimeMessageDispatcher =
  createRuntimeMessageDispatcher;

let runtimeMessages: RuntimeMessageDispatcher | null = null;
globalThis.PipCompanion.runtimeMessages = {
  addListener(types, handler) {
    runtimeMessages ??= createRuntimeMessageDispatcher((listener) =>
      chrome.runtime.onMessage.addListener(listener),
    );
    runtimeMessages.addListener(types, handler);
  },
};
