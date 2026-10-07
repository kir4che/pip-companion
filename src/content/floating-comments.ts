"use strict";

const FLOATING_COMMENTS_BODY_CLASS = "yt-floating-comments-open";
const FLOATING_COMMENTS_BOTTOM_SHEET_CLASS =
  "yt-floating-comments-bottom-sheet";

function updateFloatingCommentsDimensions() {
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

function ensureFloatingCommentsCloseButton(comments: Element) {
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
    "ytd-comments-header-renderer #title",
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

  const comments =
    document.querySelector("#comments") ||
    document.querySelector("ytd-comments");
  const toggleBtn = document.querySelector(".yt-floating-comments-btn");

  if (shouldOpen) {
    if (!comments) return;
    comments.removeAttribute("hidden");
    updateFloatingCommentsDimensions();
    document.body.classList.add(FLOATING_COMMENTS_BODY_CLASS);
    toggleBtn?.classList.add("active");

    if (comments.querySelectorAll("ytd-comment-thread-renderer").length === 0) {
      const originalY = window.scrollY;
      comments.scrollIntoView({ behavior: "instant", block: "start" });
      window.setTimeout(() => {
        window.scrollTo({ top: originalY, behavior: "instant" });
        ensureFloatingCommentsCloseButton(comments);
      }, 60);
      window.setTimeout(() => {
        ensureFloatingCommentsCloseButton(comments);
      }, 500);
      window.setTimeout(() => {
        ensureFloatingCommentsCloseButton(comments);
      }, 1200);
    }
  } else {
    document.body.classList.remove(FLOATING_COMMENTS_BODY_CLASS);
    document.body.classList.remove(FLOATING_COMMENTS_BOTTOM_SHEET_CLASS);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ensureFloatingCommentsButton(shortcut: Shortcut) {
  const { formatShortcut } = globalThis.PipCompanion.util;
  const rightControls = document.querySelector(".ytp-right-controls");
  if (!rightControls) return;

  const shortcutText = formatShortcut(shortcut);
  const tooltipText = `浮動留言區 (${shortcutText})`;
  const existing = rightControls.querySelector(".yt-floating-comments-btn");
  if (existing) {
    if (existing.getAttribute("data-shortcut") === shortcutText) return;
    existing.remove();
  }

  const btn = document.createElement("button");
  btn.className = "ytp-button yt-floating-comments-btn";
  btn.setAttribute("aria-label", tooltipText);
  btn.setAttribute("data-tooltip-title", tooltipText);
  btn.setAttribute("data-title-no-tooltip", "浮動留言區");
  btn.setAttribute("aria-keyshortcuts", formatShortcut(shortcut, true));
  btn.setAttribute("data-shortcut", shortcutText);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z",
  );
  svg.appendChild(path);
  btn.appendChild(svg);

  btn.addEventListener("click", () => toggleFloatingComments());

  const tooltip = document.createElement("div");
  tooltip.className = "yt-floating-comments-tooltip";
  tooltip.textContent = tooltipText;
  btn.appendChild(tooltip);
  btn.addEventListener("pointerenter", () => tooltip.classList.add("show"));
  btn.addEventListener("pointerleave", () => tooltip.classList.remove("show"));

  const subtitlesBtn = rightControls.querySelector(".ytp-subtitles-button");
  if (subtitlesBtn) subtitlesBtn.after(btn);
  else rightControls.appendChild(btn);

  if (document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS))
    btn.classList.add("active");
}
