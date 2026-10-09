"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.ContentDanmakuSender = (() => {
  const site = globalThis.PipCompanion.site;

  function getSender(): ContentDanmakuSenderPlatformApi | null {
    if (site.isBahamutHost(location.hostname))
      return globalThis.PipCompanion.ContentBahamutDanmakuSender;
    if (site.isBilibiliHost(location.hostname))
      return globalThis.PipCompanion.ContentBilibiliDanmakuSender;
    if (site.isYouTubeHost(location.hostname))
      return globalThis.PipCompanion.ContentYouTubeDanmakuSender;
    return null;
  }

  function isSupportedPage(): boolean {
    return getSender()?.isSupportedPage() ?? false;
  }

  function getCharacterLimit(): number | null {
    return getSender()?.getCharacterLimit() ?? null;
  }

  async function send(
    text: string,
  ): Promise<{ ok: boolean; nativeInputCleared: boolean }> {
    const sender = getSender();
    if (!sender)
      return {
        ok: false,
        nativeInputCleared: false,
      };
    return sender.send(text);
  }

  return { isSupportedPage, getCharacterLimit, send };
})();
