"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.ContentPlatform = (() => {
  // 平台能力代表可嘗試的功能，不保證每部影片或帳號皆可使用。
  function getCapabilities(): ContentPlatformCapabilities {
    const site = globalThis.PipCompanion.site;
    const hostname = location.hostname;

    if (site.isYouTubeHost(hostname))
      return {
        id: "youtube",
        captions: true,
        danmakuDisplay: true,
        danmakuSend:
          globalThis.PipCompanion.ContentDanmakuSender.isSupportedPage(),
        screenshot: true,
      };
    if (site.isBilibiliHost(hostname) || site.isBilibiliLiveHost(hostname))
      return {
        id: "bilibili",
        captions: true,
        danmakuDisplay: true,
        danmakuSend:
          globalThis.PipCompanion.ContentDanmakuSender.isSupportedPage(),
        screenshot: true,
      };
    if (site.isTwitchHost(hostname))
      return {
        id: "twitch",
        captions: false,
        danmakuDisplay: true,
        danmakuSend: false,
        screenshot: true,
      };
    if (site.isBahamutHost(hostname))
      return {
        id: "bahamut",
        captions: false,
        danmakuDisplay: true,
        danmakuSend:
          globalThis.PipCompanion.ContentDanmakuSender.isSupportedPage(),
        screenshot: true,
      };

    // 未列入平台清單的網站沿用通用影片能力，不額外辨識 Netflix。
    return {
      id: "generic",
      captions: true,
      danmakuDisplay: false,
      danmakuSend: false,
      screenshot: true,
    };
  }

  return { getCapabilities };
})();
