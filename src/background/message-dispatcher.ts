import { isRecord } from "../shared/type-guards.js";
import { isSupportedDanmakuSender } from "./danmaku-utils.js";

type MessageHandler = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void | Promise<boolean | void>;

const handlers = new Map<string, Set<MessageHandler>>();
const messageTypes = new Set([
  "START_EXTRA_YOUTUBE_CHAT",
  "STOP_EXTRA_YOUTUBE_CHAT",
  "EXTRA_YOUTUBE_CHAT_CLOCK",
  "YOUTUBE_CHAT_MESSAGE",
  "YOUTUBE_CHAT_ENDED",
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTranslationProvider(value: unknown): boolean {
  return value === "microsoft" || value === "google" || value === "deepl";
}

const webTabMessageTypes = new Set([
  "PIP_STATE_CHANGED",
  "PIP_SOURCE_PLAYBACK_CHANGED",
  "PIP_SUBTITLES_ENABLED_CHANGED",
  "EXTRA_DANMAKU_SOURCE_CHANGED",
  "GET_PIP_BOUNDS",
  "REQUEST_PIP_HANDOFF",
  "SAVE_PIP_BOUNDS",
  "RESTORE_PIP_BOUNDS",
  "CENTER_PIP_BOUNDS",
  "RESIZE_PIP_WINDOW",
  "GET_BILIBILI_DANMAKU",
  "GET_BAHAMUT_DANMAKU",
  "START_EXTRA_TWITCH_CHAT",
  "STOP_EXTRA_TWITCH_CHAT",
  "GET_BILIBILI_SUBTITLE_CUES",
  "GET_SUBTITLE_TRANSLATION_LANGUAGES",
  "GET_SUBTITLE_TRANSLATION_SERVICES",
  "SET_SUBTITLE_TRANSLATION_PROVIDER",
  "TRANSLATE_SUBTITLE_CUES",
]);

const sameOriginMessageTypes = new Set([
  "GET_BILIBILI_DANMAKU",
  "GET_BAHAMUT_DANMAKU",
]);

function hasWebTabSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.tab?.id === undefined || !sender.tab.url) return false;
  try {
    const tabUrl = new URL(sender.tab.url);
    const senderUrl = sender.url ? new URL(sender.url) : tabUrl;
    return (
      (tabUrl.protocol === "https:" || tabUrl.protocol === "http:") &&
      (senderUrl.protocol === "https:" || senderUrl.protocol === "http:")
    );
  } catch {
    return false;
  }
}

// SPA 導覽時 sender.url 與 tab.url 可能短暫不同，因此只要求同源且為頂層 frame。
function isOwnTopFrameSender(sender: chrome.runtime.MessageSender): boolean {
  if (
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.tab.url ||
    !sender.url
  )
    return false;
  try {
    const tabUrl = new URL(sender.tab.url);
    const senderUrl = new URL(sender.url);
    const isWeb = (url: URL) =>
      url.protocol === "https:" || url.protocol === "http:";
    return (
      isWeb(tabUrl) && isWeb(senderUrl) && senderUrl.origin === tabUrl.origin
    );
  } catch {
    return false;
  }
}

function isAuthorizedSender(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): boolean {
  if (
    [
      "START_EXTRA_YOUTUBE_CHAT",
      "STOP_EXTRA_YOUTUBE_CHAT",
      "EXTRA_YOUTUBE_CHAT_CLOCK",
      "YOUTUBE_CHAT_MESSAGE",
      "YOUTUBE_CHAT_ENDED",
    ].includes(message.type as string)
  )
    return isOwnTopFrameSender(sender);
  if (sameOriginMessageTypes.has(message.type as string))
    return isSupportedDanmakuSender(sender);
  if (webTabMessageTypes.has(message.type as string))
    return hasWebTabSender(sender);
  if (message.type === "TEST_SUBTITLE_TRANSLATION")
    return sender.url?.startsWith(chrome.runtime.getURL("")) === true;
  return true;
}

function isValidMessage(message: Record<string, unknown>): boolean {
  switch (message.type) {
    case "START_EXTRA_YOUTUBE_CHAT":
    case "STOP_EXTRA_YOUTUBE_CHAT":
    case "EXTRA_YOUTUBE_CHAT_CLOCK":
    case "YOUTUBE_CHAT_MESSAGE":
    case "YOUTUBE_CHAT_ENDED": {
      if (
        typeof message.connectionId !== "string" ||
        !/^[\w-]{1,100}$/.test(message.connectionId)
      )
        return false;
      if (message.type === "START_EXTRA_YOUTUBE_CHAT")
        return (
          typeof message.videoId === "string" &&
          /^[\w-]{11}$/.test(message.videoId)
        );
      if (
        message.type === "STOP_EXTRA_YOUTUBE_CHAT" ||
        message.type === "YOUTUBE_CHAT_ENDED"
      )
        return true;
      if (
        !Number.isSafeInteger(message.seekRevision) ||
        (message.seekRevision as number) < 0
      )
        return false;
      if (message.type === "EXTRA_YOUTUBE_CHAT_CLOCK")
        return (
          isFiniteNumber(message.time) &&
          message.time >= 0 &&
          message.time <= 1e8 &&
          typeof message.paused === "boolean" &&
          typeof message.ended === "boolean"
        );
      return (
        isRecord(message.data) &&
        typeof message.data.text === "string" &&
        message.data.text.length <= 2000 &&
        JSON.stringify(message.data).length <= 32768
      );
    }
    case "PING":
    case "GET_PIP_STATE":
    case "CLOSE_PIP":
    case "CLOSE_ALL_PIP":
    case "GET_PIP_BOUNDS":
    case "REQUEST_PIP_HANDOFF":
    case "OPEN_PIP":
    case "GET_EXTRA_DANMAKU_SOURCE":
    case "STOP_EXTRA_TWITCH_CHAT":
    case "GET_SUBTITLE_TRANSLATION_LANGUAGES":
    case "GET_SUBTITLE_TRANSLATION_SERVICES":
      return true;
    case "PIP_STATE_CHANGED":
      return (
        typeof message.pipOpen === "boolean" &&
        (message.playing === undefined ||
          typeof message.playing === "boolean") &&
        (message.subtitlesEnabled === undefined ||
          typeof message.subtitlesEnabled === "boolean")
      );
    case "PIP_GLOBAL_STATE":
      return (
        typeof message.pipOpen === "boolean" &&
        (message.sourcePlaying === undefined ||
          typeof message.sourcePlaying === "boolean")
      );
    case "SAVE_PIP_BOUNDS":
    case "CENTER_PIP_BOUNDS":
      return (
        [
          message.innerWidth,
          message.left,
          message.top,
          message.width,
          message.height,
        ].every(isFiniteNumber) &&
        (message.innerWidth as number) > 0 &&
        (message.width as number) > 0 &&
        (message.height as number) > 0
      );
    case "RESTORE_PIP_BOUNDS":
      return isFiniteNumber(message.innerWidth) && message.innerWidth > 0;
    case "PIP_SOURCE_PLAYBACK_CHANGED":
      return typeof message.playing === "boolean";
    case "PIP_SUBTITLES_ENABLED_CHANGED":
      return typeof message.enabled === "boolean";
    case "EXTRA_DANMAKU_SOURCE_STATUS":
      return (
        (message.error === null || typeof message.error === "string") &&
        (message.loading === undefined ||
          typeof message.loading === "boolean") &&
        Number.isSafeInteger(message.revision) &&
        (message.revision as number) >= 0
      );
    case "EXTRA_DANMAKU_SOURCE_CHANGED":
    case "SET_EXTRA_DANMAKU_SOURCE": {
      const source = message.source;
      return (
        isRecord(source) &&
        typeof source.enabled === "boolean" &&
        typeof source.url === "string" &&
        source.url.length <= 2048 &&
        (!source.enabled || source.url !== "") &&
        typeof source.offsetSeconds === "number" &&
        Number.isFinite(source.offsetSeconds) &&
        Math.abs(source.offsetSeconds) <= 3600 &&
        (message.type === "SET_EXTRA_DANMAKU_SOURCE" ||
          typeof message.available === "boolean")
      );
    }
    case "RESIZE_PIP_WINDOW":
      return (
        isFiniteNumber(message.innerWidth) &&
        message.innerWidth > 0 &&
        isFiniteNumber(message.width) &&
        message.width > 0 &&
        isFiniteNumber(message.height) &&
        message.height > 0
      );
    case "GET_BILIBILI_DANMAKU": {
      const hasBvid = typeof message.bvid === "string";
      const hasAvid = typeof message.avid === "string";
      return (
        hasBvid !== hasAvid &&
        (hasBvid
          ? /^BV[\w]{10}$/i.test(message.bvid as string)
          : /^\d+$/.test(message.avid as string)) &&
        Number.isSafeInteger(message.page) &&
        (message.page as number) >= 1 &&
        (message.page as number) <= 1000 &&
        (message.startSegment === undefined ||
          (Number.isSafeInteger(message.startSegment) &&
            (message.startSegment as number) > 0)) &&
        (message.endSegment === undefined ||
          (Number.isSafeInteger(message.endSegment) &&
            (message.endSegment as number) > 0)) &&
        (message.startSegment === undefined ||
          message.endSegment === undefined ||
          ((message.endSegment as number) >= (message.startSegment as number) &&
            (message.endSegment as number) - (message.startSegment as number) <=
              5))
      );
    }
    case "GET_BAHAMUT_DANMAKU":
      return (
        typeof message.videoSn === "string" &&
        /^\d{1,12}$/.test(message.videoSn) &&
        Number(message.videoSn) > 0
      );
    case "START_EXTRA_TWITCH_CHAT":
      return (
        typeof message.channel === "string" &&
        /^[a-z0-9_]{1,25}$/i.test(message.channel)
      );
    case "EXTRA_TWITCH_CHAT_STATUS":
      return (
        typeof message.channel === "string" &&
        /^[a-z0-9_]{1,25}$/i.test(message.channel) &&
        typeof message.connectionId === "string" &&
        message.connectionId.length <= 100 &&
        (message.status === "connected" || message.status === "error") &&
        (message.error === undefined || typeof message.error === "string")
      );
    case "EXTRA_TWITCH_CHAT_MESSAGE":
      return (
        typeof message.channel === "string" &&
        /^[a-z0-9_]{1,25}$/i.test(message.channel) &&
        typeof message.connectionId === "string" &&
        message.connectionId.length <= 100 &&
        isRecord(message.data) &&
        typeof message.data.text === "string" &&
        message.data.text.length <= 2000
      );
    case "GET_BILIBILI_SUBTITLE_CUES":
      return typeof message.url === "string" && message.url.length <= 8192;
    case "SET_SUBTITLE_TRANSLATION_PROVIDER":
      return isTranslationProvider(message.provider);
    case "TRANSLATE_SUBTITLE_CUES":
      return (
        typeof message.targetLanguage === "string" &&
        message.targetLanguage.length <= 64 &&
        Array.isArray(message.texts) &&
        message.texts.length <= 100 &&
        message.texts.every(
          (text) => typeof text === "string" && text.length <= 2000,
        )
      );
    case "TEST_SUBTITLE_TRANSLATION":
      return (
        isTranslationProvider(message.provider) && isRecord(message.config)
      );
    default:
      return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRecord(message) || typeof message.type !== "string") return false;
  if (!messageTypes.has(message.type)) return false;
  if (!isValidMessage(message)) {
    sendResponse({ ok: false, error: "Invalid message" });
    return false;
  }
  if (!isAuthorizedSender(message, sender)) {
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
  for (const handler of handlers.get(message.type) ?? []) {
    try {
      const result = handler(message, sender, respondOnce);
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

export const runtimeMessageDispatcher = {
  addListener(types: string | readonly string[], handler: MessageHandler) {
    for (const type of typeof types === "string" ? [types] : types) {
      const typeHandlers = handlers.get(type) ?? new Set();
      typeHandlers.add(handler);
      handlers.set(type, typeHandlers);
    }
  },
};
