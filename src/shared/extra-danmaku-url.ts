"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.isValidExtraDanmakuSourceUrl = function (
  value: string,
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (/(^|\.)bilibili\.com$/i.test(url.hostname)) {
      const page = Number(url.searchParams.get("p") || 1);
      return (
        /^\/video\/(?:BV[\w]{10}|av\d+)\/?$/i.test(url.pathname) &&
        Number.isInteger(page) &&
        page >= 1 &&
        page <= 1000
      );
    }
    if (url.hostname.toLowerCase() === "ani.gamer.com.tw") {
      const videoSn = url.searchParams.get("sn") || "";
      return (
        url.pathname === "/animeVideo.php" &&
        /^\d{1,12}$/.test(videoSn) &&
        Number(videoSn) > 0
      );
    }
    if (/(^|\.)youtube\.com$/i.test(url.hostname))
      return url.pathname === "/watch"
        ? /^[\w-]{11}$/.test(url.searchParams.get("v") || "")
        : /^\/live\/[\w-]{11}\/?$/.test(url.pathname);
    if (/(^|\.)twitch\.tv$/i.test(url.hostname))
      return /^\/[a-z0-9_]{1,25}$/i.test(url.pathname);
    return false;
  } catch {
    return false;
  }
};
