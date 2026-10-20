"use strict";

globalThis.PipCompanion.ContentScreenshot = (() => {
  function screenshotFilename() {
    const title =
      document.title
        .replace(/\s*[-–]\s*(YouTube|Twitch)\s*$/i, "")
        .replace(/[\\/:*?"<>|\r\n\t]/g, "_")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 80) || "Screenshot";

    const now = new Date();
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}`;
    return `${title}_${dateStr}.png`;
  }

  function downloadViaAnchor(url: string, filename: string) {
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      const root = document.body || document.documentElement;
      root.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // 失敗即放棄下載
    }
  }

  function resolveScreenshotVideo(): HTMLVideoElement | null {
    // 1. 若 PiP 開啟中，以 PiP 內掛載的影片為準
    if (state.pipWindow && !state.pipWindow.closed) {
      if (state.sourceVideo?.videoWidth && state.sourceVideo.videoHeight)
        return state.sourceVideo;
      if (state.pipUi?.video?.videoWidth && state.pipUi.video.videoHeight)
        return state.pipUi.video;
    }

    // 2. 主頁面情境：優先動態尋找當前最活躍、正在播放的主影片
    const activeVideo = globalThis.PipCompanion.ContentVideo.findVideo();
    if (activeVideo && activeVideo.videoWidth && activeVideo.videoHeight) {
      if (
        activeVideo !== state.sourceVideo &&
        (!state.sourceVideo?.isConnected ||
          state.sourceVideo.paused ||
          !activeVideo.paused)
      ) {
        globalThis.PipCompanion.ContentPipLifecycle.bindSourceVideo(
          activeVideo,
        );
      }
      return activeVideo;
    }

    // 3. Fallback 回快取的 sourceVideo（確保靜態暫停等特殊情境也能截圖）
    if (
      state.sourceVideo?.isConnected &&
      state.sourceVideo.videoWidth &&
      state.sourceVideo.videoHeight
    )
      return state.sourceVideo;

    return null;
  }

  function savePipScreenshot() {
    if (!state.screenshotEnabled) return;
    const video = resolveScreenshotVideo();
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      downloadViaAnchor(canvas.toDataURL("image/png"), screenshotFilename());
      globalThis.PipCompanion.ContentFeedback.showFeedback(
        globalThis.PipCompanion.util.getMessage("screenshotSaved"),
      );
    } catch (err) {
      globalThis.PipCompanion.ContentFeedback.showFeedback(
        err instanceof Error && err.name === "SecurityError"
          ? globalThis.PipCompanion.util.getMessage("screenshotCrossOrigin")
          : globalThis.PipCompanion.util.getMessage("screenshotFailed"),
      );
    }
  }

  function ensureScreenshotButton(shortcut: Shortcut) {
    const rightControls = document.querySelector(".ytp-right-controls");
    if (!rightControls) return;

    const shortcutText = globalThis.PipCompanion.util.formatShortcut(shortcut);
    const tooltipText = shortcut.code
      ? globalThis.PipCompanion.util.getMessage(
          "screenshotTooltip",
          shortcutText,
        )
      : globalThis.PipCompanion.util.getMessage("screenshot");
    const existing = rightControls.querySelector(".yt-pip-screenshot-btn");
    if (existing) {
      if (existing.getAttribute("data-shortcut") === shortcutText) {
        existing.setAttribute("aria-label", tooltipText);
        existing.setAttribute("data-tooltip-title", tooltipText);
        existing.setAttribute(
          "data-title-no-tooltip",
          globalThis.PipCompanion.util.getMessage("screenshot"),
        );
        const tooltip = existing.querySelector(".yt-pip-screenshot-tooltip");
        if (tooltip) tooltip.textContent = tooltipText;
        return;
      }
      existing.remove();
    }

    const btn = document.createElement("button");
    btn.className = "ytp-button yt-pip-screenshot-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", tooltipText);
    btn.setAttribute("data-tooltip-title", tooltipText);
    btn.setAttribute(
      "data-title-no-tooltip",
      globalThis.PipCompanion.util.getMessage("screenshot"),
    );
    const ariaShortcut = globalThis.PipCompanion.util.formatShortcut(
      shortcut,
      true,
    );
    if (ariaShortcut) btn.setAttribute("aria-keyshortcuts", ariaShortcut);
    btn.setAttribute("data-shortcut", shortcutText);

    const icons = globalThis.PipCompanion?.icons;
    if (icons)
      btn.appendChild(
        icons.createSvg(document, {
          path: icons.SCREENSHOT_PATH,
          fill: "currentColor",
        }),
      );

    btn.addEventListener("click", () => savePipScreenshot());

    const tooltip = document.createElement("div");
    tooltip.className = "yt-pip-screenshot-tooltip";
    tooltip.textContent = tooltipText;
    btn.appendChild(tooltip);
    btn.addEventListener("pointerenter", () => tooltip.classList.add("show"));
    btn.addEventListener("pointerleave", () =>
      tooltip.classList.remove("show"),
    );

    const anchor =
      rightControls.querySelector(".yt-floating-comments-btn") ??
      rightControls.querySelector(".ytp-subtitles-button");
    if (anchor) anchor.after(btn);
    else rightControls.appendChild(btn);
  }

  return {
    savePipScreenshot,
    ensureScreenshotButton,
  };
})();
