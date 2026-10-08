"use strict";

globalThis.PipCompanion.ContentScreenshot = (() => {
  function screenshotFilename() {
    const title =
      document.title
        .replace(/\s*[-–]\s*YouTube\s*$/i, "")
        .replace(/[\\/:*?"<>|]/g, "_")
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
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // 失敗即放棄下載
    }
  }

  function savePipScreenshot() {
    if (!state.screenshotEnabled) return;
    const video =
      (state.sourceVideo?.videoWidth ? state.sourceVideo : null) ||
      (state.pipUi?.video?.videoWidth ? state.pipUi.video : null) ||
      globalThis.PipCompanion.ContentVideo.findVideo();
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      downloadViaAnchor(canvas.toDataURL("image/png"), screenshotFilename());
      globalThis.PipCompanion.ContentFeedback.showFeedback("已截圖");
    } catch (error) {
      globalThis.PipCompanion.ContentFeedback.showFeedback(
        error instanceof Error && error.name === "SecurityError"
          ? "跨來源影片無法截圖"
          : "截圖失敗",
      );
    }
  }

  function ensureScreenshotButton(shortcut: Shortcut) {
    const rightControls = document.querySelector(".ytp-right-controls");
    if (!rightControls) return;

    const shortcutText = globalThis.PipCompanion.util.formatShortcut(shortcut);
    const tooltipText = `截圖 (${shortcutText})`;
    const existing = rightControls.querySelector(".yt-pip-screenshot-btn");
    if (existing) {
      if (existing.getAttribute("data-shortcut") === shortcutText) return;
      existing.remove();
    }

    const btn = document.createElement("button");
    btn.className = "ytp-button yt-pip-screenshot-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", tooltipText);
    btn.setAttribute("data-tooltip-title", tooltipText);
    btn.setAttribute("data-title-no-tooltip", "截圖");
    btn.setAttribute(
      "aria-keyshortcuts",
      globalThis.PipCompanion.util.formatShortcut(shortcut, true),
    );
    btn.setAttribute("data-shortcut", shortcutText);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute(
      "d",
      "M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
    );
    svg.appendChild(path);
    btn.appendChild(svg);

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
