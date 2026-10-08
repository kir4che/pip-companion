"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.site = (() => {
  function isYouTubeHost(hostname: string): boolean {
    return /(^|\.)youtube\.com$/.test(hostname);
  }

  function isBilibiliHost(hostname: string): boolean {
    return /(^|\.)bilibili\.com$/.test(hostname);
  }

  function isBilibiliLiveHost(hostname: string): boolean {
    return hostname === "live.bilibili.com";
  }

  function isTwitchHost(hostname: string): boolean {
    return /(^|\.)twitch\.tv$/.test(hostname);
  }

  function isBahamutHost(hostname: string): boolean {
    return hostname === "ani.gamer.com.tw";
  }

  function isGamerHost(hostname: string): boolean {
    return /(^|\.)gamer\.com\.tw$/.test(hostname);
  }

  function parseYouTubeVideoId(href: string): string | null {
    try {
      const url = new URL(href);
      const videoId = url.searchParams.get("v");
      if (videoId) return videoId;
      return (
        url.pathname.match(/^\/(?:live|shorts|embed)\/([^/?]+)/)?.[1] ?? null
      );
    } catch {
      return null;
    }
  }

  function parseBilibiliVideoPath(pathname: string): {
    videoId: string;
    bvid: string;
    avid: string;
  } | null {
    const videoId = pathname.match(/^\/video\/(BV[\w]{10}|av\d+)/i)?.[1];
    if (!videoId) return null;

    return {
      videoId,
      bvid: /^BV/i.test(videoId) ? videoId : "",
      avid: /^av/i.test(videoId) ? videoId.slice(2) : "",
    };
  }

  return {
    isYouTubeHost,
    isBilibiliHost,
    isBilibiliLiveHost,
    isTwitchHost,
    isBahamutHost,
    isGamerHost,
    parseYouTubeVideoId,
    parseBilibiliVideoPath,
  };
})();
