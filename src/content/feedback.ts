"use strict";

globalThis.PipCompanion.ContentFeedback = (() => {
  const icons = globalThis.PipCompanion?.icons;
  const PLAY_ICON_PATH = icons?.PLAY_PATH || "M8 5v14l11-7z";
  const PAUSE_ICON_PATH =
    icons?.PAUSE_PATH || "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
  const FRAME_PREV_ICON_PATH =
    icons?.FRAME_PREV_PATH || "M14 6l-6 6 6 6V6zm-7 0l-6 6 6 6V6z";
  const FRAME_NEXT_ICON_PATH =
    icons?.FRAME_NEXT_PATH || "M4 6l6 6-6 6V6zm7 0l6 6-6 6V6z";

  function revealFeedback() {
    if (!state.pipUi) return;
    state.pipUi.feedback.hidden = false;
    window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = window.setTimeout(() => {
      if (state.pipUi) state.pipUi.feedback.hidden = true;
    }, 900);
  }

  function showFeedback(text: string) {
    if (!state.pipUi) {
      showPageToast(text);
      return;
    }
    state.pipUi.feedback.dataset.mode = "text";
    state.pipUi.feedback.textContent = text;
    revealFeedback();
  }

  function showPageToast(text: string) {
    if (!state.pageToastEl) {
      state.pageToastEl = document.createElement("div");
      state.pageToastEl.setAttribute("role", "status");
      state.pageToastEl.setAttribute("aria-live", "polite");
      state.pageToastEl.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:80px",
        "transform:translateX(-50%)",
        "z-index:2147483647",
        "max-width:80vw",
        "padding:10px 16px",
        "border-radius:8px",
        "background:rgba(0,0,0,0.82)",
        "color:#fff",
        "font:500 14px/1.4 system-ui,-apple-system,sans-serif",
        "pointer-events:none",
        "opacity:0",
        "transition:opacity 0.2s ease",
      ].join(";");
    }

    state.pageToastEl.textContent = text;
    (document.body ?? document.documentElement).appendChild(state.pageToastEl);
    state.pageToastEl.style.opacity = "1";
    const toastEl = state.pageToastEl;
    window.clearTimeout(state.pageToastTimer);
    state.pageToastTimer = window.setTimeout(() => {
      if (toastEl) toastEl.style.opacity = "0";
    }, 1200);
  }

  function showIconFeedback(pathData: string) {
    if (!state.pipUi) return;
    const doc = state.pipUi.feedback.ownerDocument;
    const icon = icons
      ? icons.createSvg(doc, { path: pathData })
      : doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    state.pipUi.feedback.dataset.mode = "icon";
    state.pipUi.feedback.replaceChildren(icon);
    revealFeedback();
  }

  function showPlaybackFeedback(paused: boolean) {
    showIconFeedback(paused ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
  }

  function showFrameStepIcon(backward: boolean) {
    showIconFeedback(backward ? FRAME_PREV_ICON_PATH : FRAME_NEXT_ICON_PATH);
  }

  function showVolumeFeedback() {
    if (!state.sourceVideo) return;
    const isMuted =
      state.sourceVideo.muted ||
      globalThis.PipCompanion.ContentPlayback.getSourceVolumePercent() === 0;

    showFeedback(
      isMuted
        ? "0%"
        : `${Math.round(globalThis.PipCompanion.ContentPlayback.getSourceVolumePercent())}%`,
    );
  }

  return {
    showFeedback,
    showPageToast,
    showPlaybackFeedback,
    showFrameStepIcon,
    showVolumeFeedback,
  };
})();
