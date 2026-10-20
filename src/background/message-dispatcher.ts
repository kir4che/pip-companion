import "../shared/extra-danmaku-url.js";
import "../shared/utils.js";
import { isSupportedDanmakuSender } from "./danmaku-utils.js";

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
    const isWeb = (url: URL) =>
      url.protocol === "https:" || url.protocol === "http:";
    return isWeb(tabUrl) && isWeb(senderUrl);
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
  msg: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): boolean {
  if (
    [
      "START_EXTRA_YOUTUBE_CHAT",
      "STOP_EXTRA_YOUTUBE_CHAT",
      "EXTRA_YOUTUBE_CHAT_CLOCK",
      "YOUTUBE_CHAT_MESSAGE",
      "YOUTUBE_CHAT_ENDED",
    ].includes(msg.type as string)
  )
    return isOwnTopFrameSender(sender);
  if (sameOriginMessageTypes.has(msg.type as string))
    return isSupportedDanmakuSender(sender);
  if (webTabMessageTypes.has(msg.type as string))
    return hasWebTabSender(sender);
  if (msg.type === "TEST_SUBTITLE_TRANSLATION")
    return sender.url?.startsWith(chrome.runtime.getURL("")) === true;
  return true;
}

export const runtimeMessageDispatcher =
  globalThis.PipCompanion.createRuntimeMessageDispatcher(
    (listener) => chrome.runtime.onMessage.addListener(listener),
    isAuthorizedSender,
  );
