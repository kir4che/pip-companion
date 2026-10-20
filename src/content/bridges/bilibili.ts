"use strict";

interface BilibiliPlaylistComponent {
  $parent: BilibiliPlaylistComponent | null;
  _props?: { info?: { bvid: string } };
  handleItemClick?: (info: { bvid: string }) => void;
}

(() => {
  window.addEventListener(
    "message",
    (event) => {
      const requestId = event.data?.requestId;
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.type !== "PIP_REQUEST_BILI_SUBTITLE_TRACKS" ||
        !Number.isSafeInteger(requestId) ||
        requestId < 1
      )
        return;

      void (async () => {
        const respond = (
          ok: boolean,
          tracks: {
            key: string;
            label: string;
            language: string;
            subtitleUrl: string;
            isAi: boolean;
          }[] = [],
        ) =>
          window.postMessage(
            {
              type: "PIP_BILI_SUBTITLE_TRACKS",
              requestId,
              ok,
              tracks,
            },
            location.origin,
          );
        try {
          const player = (
            window as Window & {
              player?: { getManifest?: () => unknown };
            }
          ).player;
          const manifest = player?.getManifest?.();
          if (
            !manifest ||
            typeof manifest !== "object" ||
            !("cid" in manifest) ||
            typeof manifest.cid !== "number" ||
            !Number.isSafeInteger(manifest.cid) ||
            manifest.cid < 1
          ) {
            respond(false);
            return;
          }

          const subtitleApiUrl = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .reverse()
            .find((name) => {
              try {
                const url = new URL(name);
                return (
                  url.origin === "https://api.bilibili.com" &&
                  url.pathname === "/x/player/wbi/v2" &&
                  url.searchParams.get("cid") === String(manifest.cid) &&
                  url.searchParams.has("w_rid") &&
                  url.searchParams.has("wts")
                );
              } catch {
                return false;
              }
            });
          if (!subtitleApiUrl) {
            respond(false);
            return;
          }

          const response = await fetch(subtitleApiUrl, {
            credentials: "include",
          });
          if (!response.ok) {
            respond(false);
            return;
          }

          const result: unknown = await response.json();
          if (
            !result ||
            typeof result !== "object" ||
            !("code" in result) ||
            result.code !== 0 ||
            !("data" in result) ||
            !result.data ||
            typeof result.data !== "object" ||
            !("subtitle" in result.data) ||
            !result.data.subtitle ||
            typeof result.data.subtitle !== "object" ||
            !("subtitles" in result.data.subtitle) ||
            !Array.isArray(result.data.subtitle.subtitles)
          ) {
            respond(false);
            return;
          }

          const tracks = result.data.subtitle.subtitles.flatMap(
            (track, index) => {
              if (
                !track ||
                typeof track !== "object" ||
                !("lan" in track) ||
                typeof track.lan !== "string" ||
                !("subtitle_url" in track) ||
                typeof track.subtitle_url !== "string" ||
                !track.subtitle_url
              )
                return [];

              const isAi = track.lan.startsWith("ai-");
              const language =
                "lan_doc" in track && typeof track.lan_doc === "string"
                  ? track.lan_doc
                  : track.lan;
              return [
                {
                  key:
                    "id_str" in track && typeof track.id_str === "string"
                      ? track.id_str
                      : String(index),
                  label: `${language}${isAi ? " (AI)" : ""}`,
                  language: isAi ? track.lan.slice(3) : track.lan,
                  subtitleUrl: track.subtitle_url,
                  isAi,
                },
              ];
            },
          );
          respond(true, tracks);
        } catch {
          respond(false);
        }
      })();
    },
    { passive: true },
  );

  window.addEventListener(
    "message",
    (e) => {
      if (
        e.source !== window ||
        e.origin !== location.origin ||
        e.data?.type !== "PIP_SELECT_BILI_ITEM" ||
        typeof e.data.bvid !== "string" ||
        !/^BV[0-9A-Za-z]+$/.test(e.data.bvid)
      )
        return;

      const item = document.querySelector<HTMLElement>(
        `.video-pod__item[data-key="${CSS.escape(e.data.bvid)}"]`,
      );
      const itemComponent = (
        item as (HTMLElement & { __vue__?: BilibiliPlaylistComponent }) | null
      )?.__vue__;
      const info = itemComponent?._props?.info;
      if (!item || !itemComponent || info?.bvid !== e.data.bvid) return;

      let parent = itemComponent.$parent;
      while (parent && typeof parent.handleItemClick !== "function")
        parent = parent.$parent;
      if (parent && info) parent.handleItemClick?.(info);
    },
    { passive: true },
  );
  const notifyNavigation = () => {
    window.postMessage({ type: "PIP_BILI_NAVIGATE" }, location.origin);
  };
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    notifyNavigation();
    return result;
  };
  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    notifyNavigation();
    return result;
  };
  window.addEventListener("popstate", notifyNavigation, { passive: true });
  window.addEventListener("hashchange", notifyNavigation, { passive: true });
})();
