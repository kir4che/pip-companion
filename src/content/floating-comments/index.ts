"use strict";

const FLOATING_COMMENTS_BODY_CLASS = "yt-floating-comments-open";
const FLOATING_COMMENTS_BOTTOM_SHEET_CLASS =
  "yt-floating-comments-bottom-sheet";
const FLOATING_COMMENTS_PANEL_CLASS = "pc-floating-comments-panel";
const BILIBILI_FLOATING_COMMENTS_BODY_CLASS = "bili-floating-comments-open";

function getFloatingCommentsRoot(): Element | null {
  if (globalThis.PipCompanion.site.isYouTubeHost(location.hostname))
    return (
      document.querySelector("#comments") ||
      document.querySelector("ytd-comments")
    );
  if (globalThis.PipCompanion.site.isBilibiliHost(location.hostname))
    return (
      document.querySelector("#comment .reply-warp") ||
      document.querySelector(".reply-warp") ||
      document.querySelector("#comment") ||
      document.querySelector("bili-comments")
    );
  return null;
}

function updateFloatingCommentsDimensions() {
  const isBilibili = globalThis.PipCompanion.site.isBilibiliHost(
    location.hostname,
  );
  if (isBilibili) {
    document.body.classList.add(
      FLOATING_COMMENTS_BOTTOM_SHEET_CLASS,
      BILIBILI_FLOATING_COMMENTS_BODY_CLASS,
    );
    const player = document.querySelector(".bpx-player, #bilibili-player");
    const playerBottom = player?.getBoundingClientRect().bottom ?? 0;
    const topY = Math.max(
      100,
      Math.min(window.innerHeight - 220, playerBottom),
    );
    document.documentElement.style.setProperty(
      "--yt-floating-comments-top",
      `${topY}px`,
    );
    return;
  }

  const watchFlexy = document.querySelector("ytd-watch-flexy");
  const isTheater = watchFlexy?.hasAttribute("theater") || false;
  const isNarrow = window.innerWidth < 1000;
  const secondary = document.querySelector("#secondary") as HTMLElement | null;
  const secWidth = secondary?.offsetWidth || 0;
  const player = document.querySelector("#movie_player");
  const playerRect = player?.getBoundingClientRect();

  const useBottomSheet = isNarrow || isTheater || secWidth < 200;

  if (useBottomSheet) {
    document.body.classList.add(FLOATING_COMMENTS_BOTTOM_SHEET_CLASS);
    const pBottom = playerRect ? Math.ceil(playerRect.bottom) : 500;
    const topY = Math.max(100, Math.min(window.innerHeight - 220, pBottom));
    document.documentElement.style.setProperty(
      "--yt-floating-comments-top",
      `${topY}px`,
    );
  } else {
    document.body.classList.remove(FLOATING_COMMENTS_BOTTOM_SHEET_CLASS);
    let targetWidth = 390;
    if (secWidth > 200 && playerRect?.right) {
      const availableWidth = window.innerWidth - playerRect.right - 12;
      targetWidth = Math.max(300, Math.min(secWidth, availableWidth));
    }
    document.documentElement.style.setProperty(
      "--yt-floating-comments-width",
      `${Math.floor(targetWidth)}px`,
    );
  }
}

function ensureFloatingCommentsButton(shortcut: Shortcut) {
  const isBilibili = globalThis.PipCompanion.site.isBilibiliHost(
    location.hostname,
  );
  const rightControls = isBilibili
    ? (document.querySelector(".bpx-player-control-bottom-right") ??
      document.querySelector(".bpx-player-control-wrap"))
    : document.querySelector(".ytp-right-controls");
  if (!rightControls) return;

  const shortcutText = globalThis.PipCompanion.util.formatShortcut(shortcut);
  const tooltipText = `留言區 (${shortcutText})`;
  const buttonClass = isBilibili
    ? "bili-floating-comments-btn"
    : "yt-floating-comments-btn";
  const existing = rightControls.querySelector(`.${buttonClass}`);
  if (existing) {
    if (existing.getAttribute("data-shortcut") === shortcutText) return;
    existing.remove();
  }

  const button = document.createElement("button");
  button.className = isBilibili
    ? "bili-floating-comments-btn"
    : "ytp-button yt-floating-comments-btn";
  button.type = "button";
  button.setAttribute("aria-label", tooltipText);
  button.setAttribute("data-tooltip-title", tooltipText);
  button.setAttribute("data-title-no-tooltip", "留言區");
  button.setAttribute(
    "aria-keyshortcuts",
    globalThis.PipCompanion.util.formatShortcut(shortcut, true),
  );
  button.setAttribute("data-shortcut", shortcutText);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
  );
  svg.appendChild(path);
  button.appendChild(svg);
  button.addEventListener("click", () => toggleFloatingComments());

  const tooltip = document.createElement("div");
  tooltip.className = "yt-floating-comments-tooltip";
  tooltip.textContent = tooltipText;
  button.appendChild(tooltip);
  button.addEventListener("pointerenter", () => tooltip.classList.add("show"));
  button.addEventListener("pointerleave", () =>
    tooltip.classList.remove("show"),
  );

  const anchor = rightControls.querySelector(
    isBilibili ? ".bpx-player-ctrl-volume" : ".ytp-subtitles-button",
  );
  if (anchor) anchor.after(button);
  else rightControls.appendChild(button);
}

function ensureFloatingCommentsCloseButton(comments: Element) {
  comments.classList.add(FLOATING_COMMENTS_PANEL_CLASS);
  let closeBtn = comments.querySelector<HTMLButtonElement>(
    ".yt-floating-comments-close-btn",
  );
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.className = "yt-floating-comments-close-btn";
    closeBtn.textContent = "✕";
    closeBtn.type = "button";
    closeBtn.setAttribute("title", "關閉留言區");
    closeBtn.setAttribute("aria-label", "關閉留言區");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFloatingComments(false);
    });
  }

  const titleRow = comments.querySelector(
    "ytd-comments-header-renderer #title, .reply-header",
  );
  if (titleRow && closeBtn.parentElement !== titleRow)
    titleRow.appendChild(closeBtn);
  if (!titleRow && closeBtn.parentElement !== comments)
    comments.prepend(closeBtn);
}

function toggleFloatingComments(forceState?: boolean) {
  const shouldOpen =
    typeof forceState === "boolean"
      ? forceState
      : !document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS);

  const comments = getFloatingCommentsRoot();
  const toggleBtn = document.querySelector(
    ".yt-floating-comments-btn, .bili-floating-comments-btn",
  );

  if (shouldOpen) {
    if (!comments) return;
    comments.removeAttribute("hidden");
    updateFloatingCommentsDimensions();
    document.body.classList.add(FLOATING_COMMENTS_BODY_CLASS);
    const isBilibili = globalThis.PipCompanion.site.isBilibiliHost(
      location.hostname,
    );
    if (isBilibili)
      document.body.classList.add(BILIBILI_FLOATING_COMMENTS_BODY_CLASS);
    toggleBtn?.classList.add("active");

    const hasComments = isBilibili
      ? comments.querySelector(
          ".reply-item, .root-reply-container, .reply-list",
        )
      : comments.querySelector("ytd-comment-thread-renderer");
    if (!hasComments) {
      const originalY = window.scrollY;
      comments.scrollIntoView({ behavior: "instant", block: "start" });
      window.setTimeout(() => {
        window.scrollTo({ top: originalY, behavior: "instant" });
        ensureFloatingCommentsCloseButton(comments);
      }, 100);
      window.setTimeout(() => {
        ensureFloatingCommentsCloseButton(comments);
      }, 500);
      window.setTimeout(() => {
        ensureFloatingCommentsCloseButton(comments);
      }, 1200);
    }
  } else {
    document.body.classList.remove(
      FLOATING_COMMENTS_BODY_CLASS,
      FLOATING_COMMENTS_BOTTOM_SHEET_CLASS,
      BILIBILI_FLOATING_COMMENTS_BODY_CLASS,
    );
    document
      .querySelectorAll(`.${FLOATING_COMMENTS_PANEL_CLASS}`)
      .forEach((panel) =>
        panel.classList.remove(FLOATING_COMMENTS_PANEL_CLASS),
      );
    toggleBtn?.classList.remove("active");
  }
}

Object.assign(globalThis, {
  ensureFloatingCommentsButton,
  getFloatingCommentsRoot,
});
