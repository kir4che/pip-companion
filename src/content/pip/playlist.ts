"use strict";

globalThis.PipCompanion.ContentPlaylist = (() => {
  const t = globalThis.PipCompanion.util.getMessage;
  const BILIBILI_EPISODE_LIST_SELECTORS = [
    ".video-pod__list",
    ".video-pod__item",
    ".cur-list",
    ".multi-page",
    ".multi-page-list",
    ".ep-list",
    ".episode-list",
    ".season-list",
    ".bpx-player-ctrl-eplist",
    ".ep-list-wrapper",
    "#eplist_module",
    ".ep-section-module",
    ".sections-list",
    ".ep-item",
  ];
  const YOUTUBE_PLAYLIST_SELECTORS =
    "ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer";
  const YOUTUBE_DURATION_SELECTOR =
    "ytd-thumbnail-overlay-time-status-renderer #text";
  const BILIBILI_DURATION_SELECTOR =
    ".video-pod__item-duration, .video-pod__item-time, .ep-duration, .duration, [class*='duration']";
  const BAHAMUT_DURATION_SELECTOR = ".duration, [class*='duration']";
  const DURATION_PATTERN = /^\d{1,2}:\d{2}(?::\d{2})?$/;
  const EPISODE_REGION_LABEL = /episodes?|集數|集数|劇集|剧集|エピソード|회차/i;

  function getYouTubePlayer(): YouTubePlayer | null {
    return document.querySelector<YouTubePlayer>("#movie_player");
  }

  function isBilibiliPage(): boolean {
    const site = globalThis.PipCompanion.site;
    return (
      site.isBilibiliHost(location.hostname) ||
      site.isBilibiliLiveHost(location.hostname)
    );
  }

  function isBahamutVideoPage(): boolean {
    return (
      globalThis.PipCompanion.site.isBahamutHost(location.hostname) &&
      location.pathname === "/animeVideo.php"
    );
  }

  function hasBilibiliEpisodeList(): boolean {
    if (/^\/bangumi\/play\/(?:ss|ep)\d+/i.test(location.pathname)) return true;
    return BILIBILI_EPISODE_LIST_SELECTORS.some((selector) =>
      document.querySelector(selector),
    );
  }

  function hasYouTubePlaylistContext(): boolean {
    return Boolean(new URL(location.href).searchParams.get("list"));
  }

  function hasYouTubePlaylistInfo(): boolean {
    const player = getYouTubePlayer();
    return Boolean(player?.getPlaylist && player.getPlaylistIndex);
  }

  function hasYouTubeNextVideo(): boolean {
    const player = getYouTubePlayer();
    if (!player?.getPlaylist || !player.getPlaylistIndex) return false;
    try {
      const playlist = player.getPlaylist();
      const index = player.getPlaylistIndex();
      return Boolean(
        playlist &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < playlist.length - 1,
      );
    } catch {
      return false;
    }
  }

  function getYouTubePlaylistElements(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(YOUTUBE_PLAYLIST_SELECTORS),
    );
  }

  function getPlaylistTitle(index: number, item?: HTMLElement): string {
    return (
      item?.querySelector("#video-title")?.textContent?.trim() ||
      item?.querySelector("[title]")?.getAttribute("title")?.trim() ||
      item?.getAttribute("title")?.trim() ||
      t("playlistVideo", String(index + 1))
    );
  }

  function normalizeDuration(
    value: string | null | undefined,
  ): string | undefined {
    const duration = value?.replace(/\s+/g, " ").trim();
    return duration && DURATION_PATTERN.test(duration) ? duration : undefined;
  }

  function getElementDuration(
    element: HTMLElement | null | undefined,
    selector: string,
  ): string | undefined {
    if (!element) return undefined;
    for (const candidate of element.querySelectorAll<HTMLElement>(selector)) {
      const duration = normalizeDuration(candidate.textContent);
      if (duration) return duration;
    }
    return undefined;
  }

  function removeDurationSuffix(title: string, duration?: string): string {
    if (!duration || !title.endsWith(duration)) return title;
    return title.slice(0, -duration.length).trimEnd() || title;
  }

  function getPlaylistIndexInfo(index: number, itemCount: number) {
    const currentIndexKnown =
      Number.isInteger(index) && index >= 0 && index < itemCount;
    return {
      currentIndex: currentIndexKnown ? index : 0,
      currentIndexKnown,
    };
  }

  function getInitialYouTubePlaylist(): {
    id: string;
    title: string;
    duration?: string;
  }[] {
    const response = globalThis as typeof globalThis & {
      ytInitialPlayerResponse?: unknown;
    };
    const isRecord = globalThis.PipCompanion.util.isRecord;
    const playerResponse = response.ytInitialPlayerResponse;
    if (!isRecord(playerResponse) || !isRecord(playerResponse.playlist))
      return [];
    const contents = playerResponse.playlist.contents;
    if (!Array.isArray(contents)) return [];

    return contents.flatMap((entry) => {
      if (!isRecord(entry) || !isRecord(entry.playlistVideoRenderer)) return [];
      const renderer = entry.playlistVideoRenderer;
      const id = typeof renderer.videoId === "string" ? renderer.videoId : "";
      const runs =
        isRecord(renderer.title) && Array.isArray(renderer.title.runs)
          ? renderer.title.runs
          : [];
      const title = runs
        .map((run) =>
          isRecord(run) && typeof run.text === "string" ? run.text : "",
        )
        .join("");
      const lengthText = isRecord(renderer.lengthText)
        ? typeof renderer.lengthText.simpleText === "string"
          ? renderer.lengthText.simpleText
          : Array.isArray(renderer.lengthText.runs)
            ? renderer.lengthText.runs
                .map((run) =>
                  isRecord(run) && typeof run.text === "string" ? run.text : "",
                )
                .join("")
            : undefined
        : undefined;
      const duration = normalizeDuration(lengthText);
      return id
        ? [
            {
              id,
              title: title || t("playlistVideo", id),
              ...(duration ? { duration } : {}),
            },
          ]
        : [];
    });
  }

  function hasYouTubePlaylist(): boolean {
    if (!hasYouTubePlaylistContext()) return false;
    try {
      if ((getYouTubePlayer()?.getPlaylist?.() || []).length >= 2) return true;
    } catch {
      // 使用頁面資料或 DOM 作為 fallback
    }

    const response = globalThis as typeof globalThis & {
      ytInitialPlayerResponse?: unknown;
    };
    const isRecord = globalThis.PipCompanion.util.isRecord;
    const playerResponse = response.ytInitialPlayerResponse;
    if (isRecord(playerResponse) && isRecord(playerResponse.playlist)) {
      const contents = playerResponse.playlist.contents;
      if (Array.isArray(contents)) {
        let itemCount = 0;
        for (const entry of contents) {
          if (
            isRecord(entry) &&
            isRecord(entry.playlistVideoRenderer) &&
            typeof entry.playlistVideoRenderer.videoId === "string" &&
            entry.playlistVideoRenderer.videoId
          ) {
            itemCount++;
            if (itemCount >= 2) return true;
          }
        }
      }
    }
    return getYouTubePlaylistElements().length >= 2;
  }

  function getYouTubePlaylist(): PlaylistInfo | null {
    if (!hasYouTubePlaylistContext()) return null;
    try {
      const player = getYouTubePlayer();
      const ids = player?.getPlaylist?.() || [];
      const bridgeCurrentIndex = Number.parseInt(
        document.documentElement.dataset.pipYtPlaylistIndex ?? "",
        10,
      );
      const apiCurrentIndex = player?.getPlaylistIndex?.() ?? -1;
      const currentIndex =
        Number.isInteger(bridgeCurrentIndex) && bridgeCurrentIndex >= 0
          ? bridgeCurrentIndex
          : apiCurrentIndex;
      const initialItems = getInitialYouTubePlaylist();
      const initialItemsById = new Map(
        initialItems.map((item) => [item.id, item]),
      );

      if (ids.length >= 2) {
        const indexInfo = getPlaylistIndexInfo(currentIndex, ids.length);
        const elementsByVideoId = new Map<string, HTMLElement>();
        for (const element of getYouTubePlaylistElements()) {
          if (element.dataset.videoId)
            elementsByVideoId.set(element.dataset.videoId, element);
        }
        return {
          items: ids.map((id, index) => {
            const element = elementsByVideoId.get(id);
            const duration =
              getElementDuration(element, YOUTUBE_DURATION_SELECTOR) ??
              initialItemsById.get(id)?.duration;
            return {
              index,
              title: getPlaylistTitle(index, element),
              videoId: id,
              ...(duration ? { duration } : {}),
            };
          }),
          ...indexInfo,
        };
      }

      if (initialItems.length >= 2) {
        const indexInfo = getPlaylistIndexInfo(
          currentIndex,
          initialItems.length,
        );
        return {
          items: initialItems.map((item, index) => ({
            index,
            title: item.title,
            videoId: item.id,
            ...(item.duration ? { duration: item.duration } : {}),
          })),
          ...indexInfo,
        };
      }

      const elements = getYouTubePlaylistElements();
      if (elements.length >= 2) {
        const indexInfo = getPlaylistIndexInfo(currentIndex, elements.length);
        return {
          items: elements.map((element, index) => {
            const duration = getElementDuration(
              element,
              YOUTUBE_DURATION_SELECTOR,
            );
            return {
              index,
              title:
                element.querySelector("#video-title")?.textContent?.trim() ||
                t("playlistVideo", String(index + 1)),
              ...(duration ? { duration } : {}),
            };
          }),
          ...indexInfo,
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  function getBilibiliPlaylistElements(): HTMLElement[] {
    let elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".video-pod__item, .cur-list li, .multi-page li, .multi-page-list li, .ep-list li, .episode-list li, .season-list li, .ep-item, .ep-sub-list-item, .section-ep-item, .bpx-player-ctrl-eplist-item",
      ),
    );
    if (elements.length < 2) {
      elements = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[class*='ep-item'], [class*='ep_item'], [class*='epItem'], a[href*='/bangumi/play/ep']",
        ),
      );
    }
    return elements.filter(
      (element, index) =>
        elements.findIndex(
          (candidate) => candidate === element || candidate.contains(element),
        ) === index,
    );
  }

  function getBilibiliPlaylist(): PlaylistInfo | null {
    if (!isBilibiliPage() || !hasBilibiliEpisodeList()) return null;
    const elements = getBilibiliPlaylistElements();
    if (elements.length < 2) return null;
    const currentBvid = globalThis.PipCompanion.site.parseBilibiliVideoPath(
      location.pathname,
    )?.bvid;
    const currentEpId = location.pathname.match(
      /\/bangumi\/play\/ep(\d+)/i,
    )?.[1];
    let routeCurrentIndex = -1;
    if (currentEpId) {
      routeCurrentIndex = elements.findIndex(
        (el) =>
          el.dataset.epId === currentEpId ||
          el.dataset.id === currentEpId ||
          el.dataset.key === currentEpId ||
          el.dataset.key === `ep${currentEpId}` ||
          Boolean(el.querySelector?.(`a[href*="ep${currentEpId}"]`)) ||
          el.getAttribute("href")?.includes(`ep${currentEpId}`),
      );
    } else if (currentBvid) {
      routeCurrentIndex = elements.findIndex(
        (el) => el.dataset.key === currentBvid,
      );
    }
    const currentIndex =
      routeCurrentIndex >= 0
        ? routeCurrentIndex
        : elements.findIndex(
            (el) =>
              el.classList.contains("on") ||
              el.classList.contains("active") ||
              el.classList.contains("cursor") ||
              el.getAttribute("aria-current") === "true" ||
              Boolean(
                el.querySelector?.(".on, .active, [aria-current='true']"),
              ),
          );
    return {
      items: elements.map((element, index) => {
        const duration = getElementDuration(
          element,
          BILIBILI_DURATION_SELECTOR,
        );
        const rawTitle =
          element.textContent?.replace(/\s+/g, " ").trim() ||
          t("playlistEpisode", String(index + 1));
        return {
          index,
          title: removeDurationSuffix(rawTitle, duration),
          ...(duration ? { duration } : {}),
          ...(element.dataset.key ? { videoId: element.dataset.key } : {}),
        };
      }),
      ...getPlaylistIndexInfo(currentIndex, elements.length),
    };
  }

  function getBahamutPlaylistElements(): HTMLAnchorElement[] {
    if (!isBahamutVideoPage()) return [];
    return Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        ".anime-title .season a[data-ani-video-sn]",
      ),
    );
  }

  function getBahamutPlaylist(): PlaylistInfo | null {
    const elements = getBahamutPlaylistElements();
    if (elements.length < 2) return null;
    const currentSn = new URLSearchParams(location.search).get("sn");
    const routeCurrentIndex = currentSn
      ? elements.findIndex(
          (element) => element.dataset.aniVideoSn === currentSn,
        )
      : -1;
    const currentIndex =
      routeCurrentIndex >= 0
        ? routeCurrentIndex
        : elements.findIndex((element) =>
            element.closest("li")?.classList.contains("playing"),
          );
    return {
      items: elements.map((element, index) => {
        const duration = getElementDuration(element, BAHAMUT_DURATION_SELECTOR);
        const rawEpisode = element.textContent?.trim() || String(index + 1);
        const episode = removeDurationSuffix(rawEpisode, duration);
        return {
          index,
          title: /^(?:第|Episode\b)/i.test(episode)
            ? episode
            : t("playlistEpisode", episode),
          ...(duration ? { duration } : {}),
          ...(element.dataset.aniVideoSn
            ? { videoId: element.dataset.aniVideoSn }
            : {}),
        };
      }),
      ...getPlaylistIndexInfo(currentIndex, elements.length),
    };
  }

  function getGenericEpisodeList(): {
    elements: HTMLAnchorElement[];
    currentIndex: number;
  } | null {
    const currentPath = location.pathname.replace(/\/+$/, "") || "/";
    const regions = document.querySelectorAll<HTMLElement>(
      "nav, [role='navigation']",
    );

    for (const region of regions) {
      const labels = [
        region.getAttribute("aria-label") ?? "",
        ...Array.from(
          region.querySelectorAll<HTMLElement>(
            "h1, h2, h3, h4, h5, h6, [role='heading']",
          ),
          (heading) => heading.textContent ?? "",
        ),
      ];
      if (!labels.some((label) => EPISODE_REGION_LABEL.test(label))) continue;

      for (const list of region.querySelectorAll<HTMLElement>(
        "ul, ol, [role='list']",
      )) {
        const seen = new Set<string>();
        const listItems = Array.from(
          list.querySelectorAll<HTMLElement>("li, [role='listitem']"),
        ).filter((item) => item.closest("ul, ol, [role='list']") === list);
        const elements = listItems.flatMap((item) => {
          const link = item.querySelector<HTMLAnchorElement>("a[href]");
          if (!link || link.closest("ul, ol, [role='list']") !== list)
            return [];
          const text = (link.innerText || link.textContent || "").trim();
          if (!text) return [];
          try {
            const url = new URL(link.href, location.href);
            if (url.origin !== location.origin || seen.has(url.href)) return [];
            seen.add(url.href);
            return /^https?:$/.test(url.protocol) ? [link] : [];
          } catch {
            return [];
          }
        });
        if (elements.length < 2) continue;

        const currentIndexes = elements.flatMap((link, index) => {
          const item = link.closest("li, [role='listitem']");
          const currentElements = item ? [link, item] : [link];
          return currentElements.some((element) => {
            const ariaCurrent = element
              .getAttribute("aria-current")
              ?.toLowerCase();
            return (
              (ariaCurrent && ariaCurrent !== "false") ||
              element.getAttribute("aria-selected") === "true"
            );
          })
            ? [index]
            : [];
        });
        if (currentIndexes.length > 1) continue;

        const pathIndexes = elements.flatMap((link, index) =>
          (new URL(link.href, location.href).pathname.replace(/\/+$/, "") ||
            "/") === currentPath
            ? [index]
            : [],
        );
        const currentIndex =
          currentIndexes[0] ??
          (pathIndexes.length === 1 ? (pathIndexes[0] ?? -1) : -1);
        if (currentIndex < 0) continue;
        return { elements, currentIndex };
      }
    }
    return null;
  }

  function getGenericEpisodePlaylist(): PlaylistInfo | null {
    const list = getGenericEpisodeList();
    if (!list) return null;
    const { elements, currentIndex } = list;

    return {
      items: elements.map((element, index) => {
        const text = (element.innerText || element.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        const duration = normalizeDuration(
          text.match(/(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)$/)?.[1],
        );
        const title = removeDurationSuffix(text, duration);
        return {
          index,
          title: title || t("playlistEpisode", String(index + 1)),
          ...(duration ? { duration } : {}),
        };
      }),
      currentIndex,
      currentIndexKnown: true,
    };
  }

  function getPlaylist(): PlaylistInfo | null {
    const site = globalThis.PipCompanion.site;
    if (site.isYouTubeHost(location.hostname)) return getYouTubePlaylist();
    if (site.isBahamutHost(location.hostname)) return getBahamutPlaylist();
    if (isBilibiliPage()) return getBilibiliPlaylist();
    return getGenericEpisodePlaylist();
  }

  function hasPlaylist(): boolean {
    const site = globalThis.PipCompanion.site;
    if (site.isYouTubeHost(location.hostname)) return hasYouTubePlaylist();
    if (site.isBahamutHost(location.hostname))
      return getBahamutPlaylistElements().length >= 2;
    if (isBilibiliPage())
      return (
        hasBilibiliEpisodeList() && getBilibiliPlaylistElements().length >= 2
      );
    return getGenericEpisodePlaylist() !== null;
  }

  function getNextItemState(): "available" | "unavailable" | "unknown" {
    if (globalThis.PipCompanion.site.isYouTubeHost(location.hostname)) {
      if (!hasYouTubePlaylistContext()) return "unavailable";
      if (!hasYouTubePlaylistInfo()) return "unknown";
      return hasYouTubeNextVideo() ? "available" : "unavailable";
    }

    const playlist = getPlaylist();
    if (!playlist?.currentIndexKnown) return "unknown";
    return playlist.currentIndex < playlist.items.length - 1
      ? "available"
      : "unavailable";
  }

  function selectYouTubePlaylistItem(
    index: number,
    item: PlaylistItem,
    preparePlaybackState: () => void,
  ) {
    preparePlaybackState();
    window.postMessage(
      { type: "PIP_SELECT_YT_PLAYLIST", index, videoId: item.videoId },
      "*",
    );
  }

  function selectPlaylistItem(index: number, preparePlaybackState: () => void) {
    const playlist = getPlaylist();
    const item = playlist?.items[index];
    if (!playlist || !Number.isInteger(index) || !item) return;

    const site = globalThis.PipCompanion.site;
    if (site.isYouTubeHost(location.hostname)) {
      selectYouTubePlaylistItem(index, item, preparePlaybackState);
      return;
    }
    if (isBahamutVideoPage()) {
      const episodeLink = getBahamutPlaylistElements()[index];
      if (episodeLink) {
        preparePlaybackState();
        episodeLink.click();
      }
      return;
    }
    if (isBilibiliPage()) {
      preparePlaybackState();
      const bvid = item.videoId;
      if (bvid && /^BV[0-9A-Za-z]+$/.test(bvid)) {
        window.postMessage(
          { type: "PIP_SELECT_BILI_ITEM", bvid },
          location.origin,
        );
        return;
      }
      const element = getBilibiliPlaylistElements()[index];
      if (!element) return;
      const target =
        element.querySelector<HTMLElement>(
          "a[href], button, [role='button']",
        ) || element;
      target.click();
      return;
    }

    const episodeLink = getGenericEpisodeList()?.elements[index];
    if (episodeLink) {
      preparePlaybackState();
      episodeLink.click();
    }
  }

  return {
    getPlaylist,
    hasPlaylist,
    selectPlaylistItem,
    getNextItemState,
  };
})();
