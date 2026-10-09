"use strict";

(() => {
  const site = globalThis.PipCompanion.site;
  const SOURCE_IS_TWITCH = site.isTwitchHost(location.hostname);
  const SOURCE_IS_BAHAMUT = site.isBahamutHost(location.hostname);
  const SOURCE_IS_BILIBILI_LIVE = site.isBilibiliLiveHost(location.hostname);

  function getSuperChatColor(node: HTMLElement): string {
    const primary =
      node.style.getPropertyValue(
        "--yt-live-chat-paid-message-primary-color",
      ) ||
      node.style.getPropertyValue(
        "--yt-live-chat-paid-message-header-background-color",
      ) ||
      node.style.getPropertyValue(
        "--yt-live-chat-paid-message-background-color",
      );
    if (primary && primary.trim()) return primary.trim();

    const header = node.querySelector("#header") || node.querySelector("#card");
    if (header) {
      const bg = window.getComputedStyle(header).backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
    }
    const nodeBg = window.getComputedStyle(node).backgroundColor;
    if (nodeBg && nodeBg !== "transparent" && nodeBg !== "rgba(0, 0, 0, 0)")
      return nodeBg;

    return "#0f9d58";
  }

  function parseReplayTimestamp(value?: string | null): number | null {
    const timestamp = value?.trim();
    if (!timestamp || !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(timestamp))
      return null;

    return globalThis.PipCompanion.util.parseTime(timestamp);
  }

  function appendMessageText(parts: DanmakuPart[], text: string): void {
    if (!text) return;
    const lastPart = parts[parts.length - 1];
    if (lastPart?.type === "text") lastPart.text += text;
    else parts.push({ type: "text", text });
  }

  function extractMessageContent(messageEl: Element): {
    parts: DanmakuPart[];
    text: string;
  } {
    const parts: DanmakuPart[] = [];

    let text = "";

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent || "";
        appendMessageText(parts, value);
        text += value;
        return;
      }
      if (!(node instanceof Element)) return;

      const el = node;
      if (el instanceof HTMLImageElement) {
        const alt =
          el.getAttribute("alt") || el.getAttribute("aria-label") || "";
        let src = "";
        try {
          const source = el.currentSrc || el.getAttribute("src");
          if (source) {
            const imageUrl = new URL(source, location.href);
            if (imageUrl.protocol === "https:") src = imageUrl.href;
          }
        } catch {}

        if (src) parts.push({ type: "image", src, alt });
        else appendMessageText(parts, alt);
        text += alt;
        return;
      }

      el.childNodes.forEach(visit);
    };

    messageEl.childNodes.forEach(visit);
    return { parts, text: text.trim() };
  }

  function extractMessageFromNode(node: Node | null): DanmakuData | null {
    if (!(node instanceof HTMLElement)) return null;

    const el = node;
    const isPaid =
      el.tagName.toLowerCase() === "yt-live-chat-paid-message-renderer" ||
      Boolean(el.closest("yt-live-chat-paid-message-renderer"));
    const isText =
      el.tagName.toLowerCase() === "yt-live-chat-text-message-renderer" ||
      Boolean(el.closest("yt-live-chat-text-message-renderer"));

    if (!isPaid && !isText) return null;

    const targetNode = (
      isPaid
        ? el.tagName.toLowerCase() === "yt-live-chat-paid-message-renderer"
          ? el
          : el.closest<HTMLElement>("yt-live-chat-paid-message-renderer")
        : el.tagName.toLowerCase() === "yt-live-chat-text-message-renderer"
          ? el
          : el.closest<HTMLElement>("yt-live-chat-text-message-renderer")
    ) as (HTMLElement & { data?: { id?: string } }) | null;

    if (!targetNode) return null;

    if (targetNode.dataset.ytDanmakuDone) return null;

    const messageEl =
      targetNode.querySelector("#message") ||
      targetNode.querySelector("#content");
    const { parts, text } = messageEl
      ? extractMessageContent(messageEl)
      : { parts: [], text: "" };
    const messageId = targetNode.id || targetNode.data?.id || "";
    const replayTime = parseReplayTimestamp(
      targetNode.querySelector("#timestamp")?.textContent,
    );

    const authorEl = targetNode.querySelector<HTMLElement>("#author-name");
    const author = authorEl
      ? (authorEl.innerText || authorEl.textContent || "").trim()
      : "";

    if (isPaid) {
      const amountEl =
        targetNode.querySelector<HTMLElement>("#purchase-amount");
      const amount = amountEl
        ? (amountEl.innerText || amountEl.textContent || "").trim()
        : "";
      const bgColor = getSuperChatColor(targetNode);

      let displayText = text;
      let displayParts = parts;
      if (!displayText && author) {
        displayText = author;
        displayParts = [{ type: "text", text: author }];
      }
      if (!displayText && !amount) return null;
      targetNode.dataset.ytDanmakuDone = "true";

      return {
        isSuperChat: true,
        amount,
        author,
        text: displayText,
        parts: displayParts,
        messageId,
        replayTime,
        bgColor,
      };
    }

    if (!text) return null;
    targetNode.dataset.ytDanmakuDone = "true";

    return {
      isSuperChat: false,
      author,
      text,
      parts,
      messageId,
      replayTime,
    };
  }

  function createDanmakuSources(
    dependencies: ContentDanmakuSourcesDependencies,
  ): ContentDanmakuSourcesController {
    let siteDanmakuObserver: MutationObserver | null = null;
    let siteDanmakuRoot: Element | null = null;
    let siteDanmakuPageKey = "";
    let processedSiteDanmaku = new WeakMap<Element, string>();

    const TWITCH_CHAT_ROOT_SELECTOR =
      '[data-test-selector="chat-scrollable-area__message-container"], .chat-scrollable-area__message-container, [data-a-target="chat-scroller"], .video-chat__message-list-wrapper ul';
    const TWITCH_MESSAGE_SELECTOR =
      '[data-a-target="chat-line-message"], .chat-line__message, [data-test-selector="chat-line-message"], [data-test-selector="chat-line"], .vod-message';
    const TWITCH_VOD_MESSAGE_SELECTOR =
      ".video-chat__message-list-wrapper ul > *";

    function isTwitchVodPage(): boolean {
      return SOURCE_IS_TWITCH && /^\/videos\/\d+/.test(location.pathname);
    }

    const BAHAMUT_DANMAKU_SELECTOR =
      '[class*="danmu" i], [class*="danmaku" i], [id*="danmu" i], [id*="danmaku" i]';
    const BILIBILI_LIVE_DANMAKU_SELECTOR = ".danmaku-item";

    function getSiteDanmakuPageKey(): string {
      if (SOURCE_IS_TWITCH || SOURCE_IS_BILIBILI_LIVE)
        return location.pathname.toLowerCase();
      if (SOURCE_IS_BAHAMUT) {
        const url = new URL(location.href);
        return `${url.pathname.toLowerCase()}?sn=${url.searchParams.get("sn") || ""}`;
      }
      return "";
    }

    function getSiteDanmakuRoot(): Element | null {
      if (SOURCE_IS_TWITCH) {
        const chatRoot = document.querySelector(TWITCH_CHAT_ROOT_SELECTOR);
        if (chatRoot) return chatRoot;

        for (const frame of document.querySelectorAll("iframe")) {
          try {
            const frameRoot = frame.contentDocument?.querySelector(
              TWITCH_CHAT_ROOT_SELECTOR,
            );
            if (frameRoot) return frameRoot;
          } catch {}
        }

        return location.pathname.startsWith("/videos/") ? document.body : null;
      }
      if (SOURCE_IS_BILIBILI_LIVE) return document.querySelector("#chat-items");
      if (!SOURCE_IS_BAHAMUT) return null;

      const video = document.querySelector("video");
      return (
        video?.closest(
          ".anime_video_area, .anime-video-area, #ani_video, .video-js",
        ) ||
        video?.parentElement?.parentElement?.parentElement ||
        document.body
      );
    }

    function getSiteDanmakuSelector(): string {
      if (SOURCE_IS_TWITCH)
        return isTwitchVodPage()
          ? TWITCH_VOD_MESSAGE_SELECTOR
          : TWITCH_MESSAGE_SELECTOR;
      if (SOURCE_IS_BILIBILI_LIVE) return BILIBILI_LIVE_DANMAKU_SELECTOR;
      return BAHAMUT_DANMAKU_SELECTOR;
    }

    function getSiteDanmakuCandidates(node: Node): Element[] {
      const selector = getSiteDanmakuSelector();
      const candidates: Element[] = [];
      if (node instanceof Element) {
        const element = node;
        if (element.matches(selector)) candidates.push(element);
        candidates.push(...element.querySelectorAll(selector));
      } else if (node.parentElement) {
        const candidate = node.parentElement.closest(selector);
        if (candidate) candidates.push(candidate);
      }

      if (SOURCE_IS_BAHAMUT)
        return candidates.filter(
          (candidate) => !candidate.querySelector(selector),
        );
      return candidates;
    }

    function extractSiteDanmaku(node: Element): DanmakuData | null {
      let messageNode = node;
      let author = "";
      if (SOURCE_IS_BILIBILI_LIVE) {
        const liveUsername: unknown = Reflect.get(node, "uname");
        const liveDanmaku: unknown = Reflect.get(node, "danmaku");
        author = (
          (typeof liveUsername === "string" ? liveUsername : "") ||
          node.getAttribute("data-uname") ||
          node.querySelector(".user-name")?.textContent ||
          ""
        ).trim();
        messageNode = node.querySelector(".danmaku-item-right") || node;
        const { parts, text } = extractMessageContent(messageNode);
        const danmakuText =
          typeof liveDanmaku === "string" ? liveDanmaku.trim() : "";
        if (!text && danmakuText)
          return {
            text: danmakuText,
            parts: [{ type: "text", text: danmakuText }],
            author,
          };
        return text ? { text, parts, author } : null;
      }
      if (SOURCE_IS_TWITCH) {
        const body = node.querySelector(
          '[data-a-target="chat-line-message-body"], [data-a-target="chat-message-text"], .text-fragment, .message',
        );
        if (body) messageNode = body;
        const authorNode = node.querySelector(
          '[data-a-target="chat-message-username"], .chat-author__display-name',
        );
        author = (authorNode?.textContent || "").trim();
      }

      const { parts, text } = extractMessageContent(messageNode);
      if (!text) return null;
      return { text, parts, author };
    }

    function processSiteDanmakuNode(node: Node, initial = false): void {
      for (const candidate of getSiteDanmakuCandidates(node)) {
        const data = extractSiteDanmaku(candidate);
        if (!data) continue;
        const signature = `${data.author || ""}\u0000${data.text || ""}`;
        if (processedSiteDanmaku.get(candidate) === signature) continue;
        processedSiteDanmaku.set(candidate, signature);
        if (!initial) dependencies.broadcast(data);
      }
    }

    function checkAndBindSiteDanmaku(): void {
      if (!SOURCE_IS_TWITCH && !SOURCE_IS_BAHAMUT && !SOURCE_IS_BILIBILI_LIVE)
        return;

      const pageKey = getSiteDanmakuPageKey();
      if (pageKey !== siteDanmakuPageKey) {
        siteDanmakuObserver?.disconnect();
        siteDanmakuObserver = null;
        siteDanmakuRoot = null;
        siteDanmakuPageKey = pageKey;
        processedSiteDanmaku = new WeakMap();
        dependencies.clear();
      }

      if (!dependencies.isSettingsLoaded() || !dependencies.isVisible()) {
        siteDanmakuObserver?.disconnect();
        siteDanmakuObserver = null;
        siteDanmakuRoot = null;
        return;
      }

      const root = getSiteDanmakuRoot();
      if (!root) {
        if (siteDanmakuObserver || siteDanmakuRoot) {
          siteDanmakuObserver?.disconnect();
          siteDanmakuObserver = null;
          siteDanmakuRoot = null;
          dependencies.clear();
        }
        return;
      }
      if (root === siteDanmakuRoot && siteDanmakuObserver) return;
      siteDanmakuObserver?.disconnect();
      siteDanmakuRoot = root;

      root.querySelectorAll(getSiteDanmakuSelector()).forEach((node) => {
        processSiteDanmakuNode(node, true);
      });

      siteDanmakuObserver = new MutationObserver((mutations) => {
        if (
          pageKey !== getSiteDanmakuPageKey() ||
          !root.isConnected ||
          getSiteDanmakuRoot() !== root
        ) {
          checkAndBindSiteDanmaku();
          return;
        }
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) processSiteDanmakuNode(node);
          if (mutation.type === "characterData")
            processSiteDanmakuNode(mutation.target);
        }
      });
      siteDanmakuObserver.observe(root, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    return {
      checkAndBind: checkAndBindSiteDanmaku,
      destroy() {
        siteDanmakuObserver?.disconnect();
        siteDanmakuObserver = null;
        siteDanmakuRoot = null;
      },
    };
  }

  globalThis.PipCompanion.ContentDanmakuSources = {
    parseYouTubeMessage: extractMessageFromNode,
    create: createDanmakuSources,
  };
})();
