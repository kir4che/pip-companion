"use strict";

globalThis.PipCompanion.ContentCaptions = (() => {
  const CAPTION_SCAN_MS = 1000;
  const CAPTION_EMPTY_LIMIT = 5;

  function getYouTubeCaptionButton() {
    if (!IS_YOUTUBE) return null;
    return document.querySelector<HTMLElement>(
      "#movie_player .ytp-subtitles-button",
    );
  }

  function enableYouTubeCaptions() {
    const button = getYouTubeCaptionButton();
    if (!button) return;
    const enabled = button.getAttribute("aria-pressed") === "true";
    if (state.youtubeCaptionsInitiallyEnabled === null)
      state.youtubeCaptionsInitiallyEnabled = enabled;
    if (!enabled) button.click();
  }

  function refreshSubtitle(force = false) {
    if (!state.pipUi) {
      state.captionObserver?.disconnect();
      state.captionObserver = null;
      state.captionNode = null;
      state.captionExtract = null;
      state.captionLines = [];
      return;
    }

    let nextNode = state.captionNode;
    if (state.captionNode?.isConnected) {
      if (Date.now() - state.lastCaptionScan >= CAPTION_SCAN_MS) {
        state.lastCaptionScan = Date.now();
        if (extractOverlayLines(state.captionNode).length)
          state.captionEmptyCount = 0;
        else if (++state.captionEmptyCount >= CAPTION_EMPTY_LIMIT) {
          state.captionEmptyCount = 0;
          state.captionObserver?.disconnect();
          state.captionObserver = null;
          state.captionNode = null;
          state.captionExtract = null;
        }
      }
      nextNode = state.captionNode;
    } else {
      if (!force && Date.now() - state.lastCaptionScan < CAPTION_SCAN_MS)
        return;
      state.lastCaptionScan = Date.now();
      nextNode = findGenericCaptionNode();
    }
    if (nextNode !== state.captionNode) {
      state.captionEmptyCount = 0;
      state.captionObserver?.disconnect();
      state.captionObserver = null;
      state.captionNode = nextNode;
      state.captionExtract = nextNode ? extractOverlayLines : null;
      const node = state.captionNode;
      const extract = state.captionExtract;
      if (node && extract) {
        state.captionObserver = new MutationObserver(() => {
          state.captionLines = extract(node);
          renderSubtitle();
        });
        state.captionObserver.observe(node, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["style"],
        });
      }
      force = true;
    }
    if (!force) return;
    const activeNode = state.captionNode;
    const activeExtract = state.captionExtract;
    state.captionLines =
      activeNode && activeExtract
        ? activeExtract(activeNode)
        : getNativeCaptionLines();
    renderSubtitle();
  }

  function findGenericCaptionNode() {
    const selector =
      '[class*="subtitle" i], [class*="caption" i], [class*="timedtext" i], [id*="subtitle" i], [id*="caption" i]';
    const scored: { element: HTMLElement; score: number }[] = [];
    for (const element of document.querySelectorAll(
      selector,
    ) as NodeListOf<HTMLElement>) {
      const text = (element.innerText || "").trim();
      if (!text || text.length > 300) continue;
      if (element.querySelector("button, a, input, select, video")) continue;
      const style = getComputedStyle(element);
      if (style.position !== "absolute" && style.position !== "fixed") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      let score = 0;
      if (style.pointerEvents === "none") score += 2;
      if (
        element.closest(
          "button, [role='button'], [role='menu'], [role='listbox']",
        )
      )
        score -= 2;
      if (
        element.closest(
          "[class*='control' i], [class*='ctrl' i], [class*='panel' i]",
        )
      )
        score -= 2;
      scored.push({ element, score });
    }

    if (!scored.length) return null;
    const best = Math.max(...scored.map((entry) => entry.score));
    const top = scored
      .filter((entry) => entry.score === best)
      .map((entry) => entry.element);
    return (
      top.find(
        (element) =>
          !top.some((other) => other !== element && other.contains(element)),
      ) ?? top[0]
    );
  }

  function extractOverlayLines(node: HTMLElement | null) {
    if (!node) return [];
    return (node.innerText || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text) => ({ segments: [{ text }] }));
  }

  function getNativeCaptionLines(): CaptionLine[] {
    const lines: CaptionLine[] = [];
    for (const track of state.sourceVideo?.textTracks ?? []) {
      if (
        (track.mode !== "showing" && track.mode !== "hidden") ||
        track.kind === "metadata" ||
        track.kind === "chapters"
      )
        continue;
      for (const cue of track.activeCues ?? []) {
        const vtt = cue as VTTCue;
        const text = (vtt.text || "").replace(/<[^>]*>/g, "");
        for (const part of text.split(/\r?\n/)) {
          if (part.trim()) lines.push({ segments: [{ text: part.trim() }] });
        }
      }
    }

    return lines;
  }

  function suppressNativeCaptions() {
    if (state.captionNode || !state.videoStash) return;
    for (const track of state.sourceVideo?.textTracks ?? []) {
      if (
        track.kind === "metadata" ||
        track.kind === "chapters" ||
        track.mode !== "showing"
      )
        continue;
      const tracks = (state.nativeCaptionTracks ??= new Map());
      if (!tracks.has(track)) tracks.set(track, track.mode);
      track.mode = "hidden";
    }
  }

  function prepareNativeCaptions() {
    enableYouTubeCaptions();
    if (state.captionNode || !state.videoStash) return;
    suppressNativeCaptions();
    const tracks = Array.from(state.sourceVideo?.textTracks ?? []).filter(
      (track) => track.kind === "subtitles" || track.kind === "captions",
    );
    if (tracks.some((track) => track.mode !== "disabled")) return;
    const track = tracks[0];
    if (!track) return;
    const changedTracks = (state.nativeCaptionTracks ??= new Map());
    if (!changedTracks.has(track)) changedTracks.set(track, track.mode);
    track.mode = "hidden";
  }

  function restoreNativeCaptionModes() {
    for (const [track, mode] of state.nativeCaptionTracks ?? []) {
      if (track.mode === "hidden") track.mode = mode;
    }
    state.nativeCaptionTracks = null;

    const button = getYouTubeCaptionButton();
    const initiallyEnabled = state.youtubeCaptionsInitiallyEnabled;
    if (
      button &&
      initiallyEnabled !== null &&
      (button.getAttribute("aria-pressed") === "true") !== initiallyEnabled
    )
      button.click();
    state.youtubeCaptionsInitiallyEnabled = null;
  }

  function syncNativeCaptions() {
    if (!state.pipUi || state.captionNode) return;
    suppressNativeCaptions();
    state.captionLines = getNativeCaptionLines();
    renderSubtitle();
  }

  function renderSubtitle() {
    if (!state.pipUi) return;
    state.pipUi.subtitle.replaceChildren();

    if (!state.captionsOn || !state.captionLines.length) {
      state.pipUi.subtitle.hidden = true;
      return;
    }

    state.pipUi.subtitle.hidden = false;
    const doc = state.pipUi.subtitle.ownerDocument;
    for (const line of state.captionLines) {
      const lineEl = doc.createElement("div");
      lineEl.className = "subtitle-line";
      for (const seg of line.segments) {
        const segEl = doc.createElement("span");
        segEl.className = "subtitle-segment";
        segEl.textContent = seg.text;
        if (seg.color) segEl.style.color = seg.color;
        if (seg.bg) segEl.style.background = seg.bg;
        if (seg.fontFamily) segEl.style.fontFamily = seg.fontFamily;
        if (seg.textShadow) segEl.style.textShadow = seg.textShadow;
        lineEl.appendChild(segEl);
      }
      state.pipUi.subtitle.appendChild(lineEl);
    }
  }

  return {
    refreshSubtitle,
    prepareNativeCaptions,
    restoreNativeCaptionModes,
    syncNativeCaptions,
    renderSubtitle,
    suppressNativeCaptions,
  };
})();
