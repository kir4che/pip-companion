"use strict";

globalThis.CaptionPiP = globalThis.CaptionPiP || {};
globalThis.CaptionPiP.PipUI = (() => {
  function create(win, actions) {
    const doc = win.document;
    doc.documentElement.lang = "zh-Hant";
    const style = doc.createElement("style");
    const css = (strings, ...values) =>
      strings.reduce(
        (out, chunk, index) => out + chunk + (values[index] ?? ""),
        "",
      );
    const baseCss = css`
      * {
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #000;
        color: #fff;
        font:
          14px/1.4 system-ui,
          -apple-system,
          sans-serif;
      }
      .app,
      .screen {
        width: 100%;
        height: 100%;
      }
      .screen {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #000;
        container-type: size;
      }
      [hidden] {
        display: none !important;
      }
    `;
    const contentCss = css`
      .video {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .subtitle {
        position: absolute;
        left: 4%;
        right: 4%;
        bottom: 12%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 0.35em;
        pointer-events: none;
        background: transparent;
        border-radius: 0;
        padding: 0;
        margin: 0;
        text-shadow: none;
      }
      .subtitle[hidden] {
        display: none !important;
      }
      .subtitle-line {
        display: block;
        text-align: center;
        max-width: 94%;
        white-space: pre-wrap;
        overflow-wrap: break-word;
        line-height: 1.35;
      }
      .subtitle-segment {
        display: inline-block;
        padding: 0.12em 0.35em;
        background: rgba(8, 8, 8, 0.75);
        color: #fff;
        font-family: "YouTube Noto", Roboto, Arial, sans-serif;
        font-size: clamp(12px, 4.8cqh, 36px);
        font-weight: 400;
        border-radius: 2px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
    `;
    const controlsCss = css`
      .controls {
        position: absolute;
        inset: auto 0 0;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 26px 10px 8px;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.82));
        opacity: 0;
        transform: translateY(4px);
        pointer-events: none;
        transition:
          opacity 0.16s ease,
          transform 0.16s ease;
      }
      .screen:hover .controls,
      .screen:focus-within .controls {
        opacity: 1;
        transform: none;
        pointer-events: auto;
      }
      .mini-progress {
        position: absolute;
        z-index: 2;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2px;
        background: rgba(255, 255, 255, 0.35);
        pointer-events: none;
        transition: opacity 0.16s ease;
      }
      .mini-progress-fill {
        display: block;
        width: 0;
        height: 100%;
        background: #f33;
      }
      .screen:hover .mini-progress,
      .screen:focus-within .mini-progress {
        opacity: 0;
      }
      .time-tooltip {
        position: absolute;
        z-index: 2;
        bottom: 52px;
        left: 0;
        transform: translateX(-50%);
        padding: 4px 7px;
        border-radius: 4px;
        color: #fff;
        background: #111e;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        pointer-events: none;
      }
      button {
        flex: 0 0 auto;
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: #111b;
        font:
          18px/1 system-ui,
          sans-serif;
        cursor: pointer;
      }
      button:hover {
        background: #444d;
      }
      button:disabled {
        opacity: 0.42;
        cursor: default;
      }
      .speed-button {
        width: 38px;
        font-size: 12px;
        font-weight: 600;
      }
      button:focus-visible {
        outline: none;
        background: #444d;
      }
      input:focus-visible {
        outline: none;
      }
      .time {
        flex: 0 0 auto;
        min-width: 78px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .progress {
        flex: 1 1 auto;
        min-width: 24px;
        accent-color: #f33;
        transform: scaleY(0.85);
      }
      button svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
    `;
    const popoverCss = css`
      .volume-control,
      .speed-control {
        position: relative;
        flex: 0 0 auto;
        height: 32px;
      }
      .volume-control::after,
      .speed-control::after {
        content: "";
        position: absolute;
        z-index: 3;
        left: -8px;
        right: -8px;
        bottom: 100%;
        height: 10px;
      }
      .volume-popover,
      .speed-popover {
        position: absolute;
        z-index: 4;
        left: 50%;
        bottom: calc(100% + 8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 4px 5px;
        border-radius: 6px;
        background: #111d;
        opacity: 0;
        pointer-events: none;
        transform: translateX(-50%);
        transition: opacity 0.12s ease;
      }
      .volume-control:hover .volume-popover,
      .volume-control:focus-within .volume-popover,
      .speed-control:hover .speed-popover,
      .speed-control:focus-within .speed-popover {
        opacity: 1;
        pointer-events: auto;
      }
      .volume-value {
        width: 36px;
        height: 20px;
        padding: 1px 2px;
        margin: 0;
        border: 1px solid transparent;
        border-radius: 4px;
        background: transparent;
        color: #fff;
        text-align: center;
        font-size: 11px;
        font-family: inherit;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        outline: none;
        box-sizing: border-box;
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }
      .volume-value:hover {
        background: rgba(255, 255, 255, 0.12);
        border-color: rgba(255, 255, 255, 0.25);
      }
      .volume-value:focus {
        background: rgba(0, 0, 0, 0.65);
        border-color: #3ea6ff;
        cursor: text;
      }
      .volume-slider,
      .speed-slider {
        position: static;
        width: 28px;
        height: 100px;
        margin: 0;
        writing-mode: vertical-lr;
        direction: rtl;
        accent-color: #f33;
      }
      .volume-feedback {
        position: absolute;
        z-index: 3;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 8px 12px;
        border-radius: 8px;
        color: #fff;
        background: rgba(0, 0, 0, 0.72);
        font-size: clamp(14px, 2.8cqmin, 24px);
        font-variant-numeric: tabular-nums;
        pointer-events: none;
      }
    `;
    const responsiveCss = css`
      @media (max-width: 440px) {
        .controls {
          gap: 5px;
          padding-inline: 6px;
        }
        .controls button {
          width: 28px;
          height: 28px;
        }
        .time {
          min-width: 55px;
        }
        .volume-slider,
        .speed-slider {
          height: 84px;
        }
      }
      @media (max-width: 440px) {
        .controls .speed-button {
          width: 34px;
        }
      }
      @media (hover: none) {
        .controls {
          opacity: 1;
          transform: none;
          pointer-events: auto;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .controls {
          transition: none;
        }
      }
    `;
    style.textContent = [
      baseCss,
      contentCss,
      controlsCss,
      popoverCss,
      responsiveCss,
    ].join("\n");

    const app = doc.createElement("main");
    app.className = "app";
    const screen = doc.createElement("div");
    screen.className = "screen";
    const video = doc.createElement("video");
    video.className = "video";
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.setAttribute("aria-label", "YouTube 影片畫面");
    const subtitle = doc.createElement("div");
    subtitle.className = "subtitle";
    subtitle.setAttribute("aria-live", "polite");
    const volumeFeedback = doc.createElement("div");
    volumeFeedback.className = "volume-feedback";
    volumeFeedback.setAttribute("role", "status");
    volumeFeedback.setAttribute("aria-live", "polite");
    volumeFeedback.hidden = true;
    const miniProgress = doc.createElement("div");
    miniProgress.className = "mini-progress";
    miniProgress.setAttribute("role", "progressbar");
    miniProgress.setAttribute("aria-label", "播放進度");
    miniProgress.setAttribute("aria-valuemin", "0");
    miniProgress.setAttribute("aria-valuemax", "100");
    miniProgress.setAttribute("aria-valuenow", "0");
    const miniProgressFill = doc.createElement("span");
    miniProgressFill.className = "mini-progress-fill";
    miniProgress.append(miniProgressFill);
    const controls = doc.createElement("div");
    controls.className = "controls";
    const timeTooltip = doc.createElement("span");
    timeTooltip.className = "time-tooltip";
    timeTooltip.hidden = true;
    timeTooltip.setAttribute("aria-hidden", "true");
    const makeButton = (action, label, ariaLabel) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      return button;
    };
    const playButton = makeButton("play", "▶", "播放影片");
    const nextButton = makeButton("next", "", "下一部影片");
    const nextIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    nextIcon.setAttribute("viewBox", "0 0 24 24");
    nextIcon.setAttribute("aria-hidden", "true");
    const nextPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    nextPath.setAttribute("d", "M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z");
    nextIcon.append(nextPath);
    nextButton.append(nextIcon);
    const speedButton = makeButton("speed", "1×", "播放速度 1×");
    speedButton.className = "speed-button";
    const timeLabel = doc.createElement("span");
    timeLabel.className = "time";
    timeLabel.textContent = "0:00 / 0:00";
    const progress = doc.createElement("input");
    progress.className = "progress";
    progress.type = "range";
    progress.min = "0";
    progress.max = "1000";
    progress.value = "0";
    progress.setAttribute("aria-label", "播放進度");
    const volumeControl = doc.createElement("div");
    volumeControl.className = "volume-control";
    const volumeButton = makeButton("volume", "", "音量控制");
    const volumeIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    volumeIcon.setAttribute("viewBox", "0 0 24 24");
    volumeIcon.setAttribute("aria-hidden", "true");
    const volumePath = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    volumePath.setAttribute("d", actions.volumeIconPath);
    volumeIcon.append(volumePath);
    volumeButton.append(volumeIcon);
    const volumePopover = doc.createElement("div");
    volumePopover.className = "volume-popover";
    const volumeValue = doc.createElement("input");
    volumeValue.type = "text";
    volumeValue.className = "volume-value";
    volumeValue.value = "100";
    volumeValue.setAttribute("aria-label", "音量數值");
    volumeValue.setAttribute("inputmode", "numeric");
    volumeValue.maxLength = 3;
    const volumeSlider = doc.createElement("input");
    volumeSlider.className = "volume-slider";
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "300";
    volumeSlider.step = "1";
    volumeSlider.value = "100";
    volumeSlider.setAttribute("aria-label", "音量");
    volumePopover.append(volumeValue, volumeSlider);
    volumeControl.append(volumeButton, volumePopover);
    const speedControl = doc.createElement("div");
    speedControl.className = "speed-control";
    const speedPopover = doc.createElement("div");
    speedPopover.className = "speed-popover";
    const speedSlider = doc.createElement("input");
    speedSlider.className = "speed-slider";
    speedSlider.type = "range";
    speedSlider.min = "0.5";
    speedSlider.max = "5";
    speedSlider.step = "0.05";
    speedSlider.value = "1";
    speedSlider.setAttribute("aria-label", "播放速度");
    speedPopover.append(speedSlider);
    speedControl.append(speedButton, speedPopover);
    for (const control of [
      playButton,
      nextButton,
      speedButton,
      volumeButton,
      progress,
      volumeSlider,
      speedSlider,
    ]) {
      control.tabIndex = -1;
    }
    controls.append(
      timeTooltip,
      playButton,
      nextButton,
      timeLabel,
      progress,
      volumeControl,
      speedControl,
    );
    screen.append(video, subtitle, volumeFeedback, miniProgress, controls);
    app.append(screen);
    doc.head.replaceChildren(style);
    doc.body.replaceChildren(app);
    doc.title = "YouTube 字幕浮窗";

    const ui = {
      video,
      subtitle,
      volumeFeedback,
      volumeValue,
      volumeButton,
      volumePath,
      playButton,
      nextButton,
      speedButton,
      speedSlider,
      volumeSlider,
      progress,
      timeLabel,
      miniProgress,
      miniProgressFill,
      timeTooltip,
    };

    const update = () => actions.updatePlaybackUi();
    const togglePlayback = () => actions.togglePlayback();
    const showSpeedFeedback = () => {
      const rate = actions.getVideo()?.playbackRate;
      if (rate) actions.showFeedback(`倍速 ${Math.round(rate * 100) / 100}×`);
    };
    const adjustPlaybackRate = (direction, wrapAtEnd = false) => {
      actions.adjustPlaybackRate(direction, wrapAtEnd);
      showSpeedFeedback();
    };
    const cyclePlaybackRate = () => adjustPlaybackRate(1, true);
    const toggleMute = () => actions.toggleMute();

    volumeButton.addEventListener("click", toggleMute);
    speedButton.addEventListener("click", cyclePlaybackRate);
    playButton.addEventListener("click", togglePlayback);
    video.addEventListener("click", togglePlayback);
    nextButton.addEventListener("click", () => actions.playNext());
    volumeSlider.addEventListener("input", () =>
      actions.setVolume(
        Number(volumeSlider.value),
        Number(volumeSlider.value) > 0,
      ),
    );
    speedSlider.addEventListener("input", () => {
      const videoSource = actions.getVideo();
      if (!videoSource) return;
      videoSource.playbackRate = Number(speedSlider.value);
      update();
      showSpeedFeedback();
    });

    const commitVolumeInput = () => {
      const raw = volumeValue.value.trim();
      const parsed = parseInt(raw, 10);
      const maxVolume = actions.getMaxVolume();
      if (!Number.isNaN(parsed)) {
        const clamped = Math.max(0, Math.min(maxVolume, parsed));
        actions.setVolume(clamped, clamped > 0);
        actions.showVolumeFeedback();
      } else {
        update();
      }
    };
    volumeValue.addEventListener("click", () => volumeValue.select());
    volumeValue.addEventListener("focus", () => volumeValue.select());
    volumeValue.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        commitVolumeInput();
        volumeValue.blur();
      } else if (event.key === "Escape") {
        update();
        volumeValue.blur();
      }
    });
    volumeValue.addEventListener("blur", commitVolumeInput);

    win.addEventListener("keydown", (event) => {
      if (event.target === volumeValue) return;
      const videoSource = actions.getVideo();
      const plain =
        !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      if (plain && event.code === "Space" && videoSource) {
        event.preventDefault();
        event.stopPropagation();
        togglePlayback();
        return;
      }
      const decreaseRate =
        event.key === "[" || (!event.shiftKey && event.code === "BracketLeft");
      const increaseRate =
        event.key === "]" || (!event.shiftKey && event.code === "BracketRight");
      if (
        videoSource &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        (decreaseRate || increaseRate)
      ) {
        event.preventDefault();
        event.stopPropagation();
        adjustPlaybackRate(decreaseRate ? -1 : 1);
        return;
      }
      if (plain && videoSource && event.key.toLowerCase() === "c") {
        event.preventDefault();
        event.stopPropagation();
        actions.toggleCaptions();
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        event.stopPropagation();
        actions.toggleComments();
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        event.stopPropagation();
        actions.screenshot();
        return;
      }
      const key = event.code === "Space" ? " " : event.key.toLowerCase();
      const rangeFocused = Boolean(
        event.target?.closest?.("input[type='range']"),
      );
      const volumeKey = key === "arrowup" || key === "arrowdown";
      const directKey = key === "m";
      const horizontalArrow = key === "arrowleft" || key === "arrowright";
      if (
        !videoSource ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        event.target?.isContentEditable ||
        (event.target?.closest?.(
          "button, input, select, textarea, [contenteditable='true']",
        ) &&
          !(directKey || (rangeFocused && (volumeKey || horizontalArrow))))
      )
        return;
      if (rangeFocused && horizontalArrow) return;

      switch (key) {
        case "arrowleft":
        case "arrowright": {
          if (
            !Number.isFinite(videoSource.duration) ||
            videoSource.duration <= 0
          )
            return;
          const delta = key === "arrowleft" ? -5 : 5;
          videoSource.currentTime = Math.max(
            0,
            Math.min(videoSource.duration, videoSource.currentTime + delta),
          );
          break;
        }
        case "arrowup":
        case "arrowdown": {
          const delta = key === "arrowup" ? 10 : -10;
          const next = Math.max(
            0,
            Math.min(
              actions.getMaxVolume(),
              actions.getVolumePercent() + delta,
            ),
          );
          actions.setVolume(next, delta > 0);
          actions.showVolumeFeedback();
          break;
        }
        case "k":
          togglePlayback();
          break;
        case "m":
          toggleMute();
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      update();
    });

    progress.addEventListener("input", () => {
      const videoSource = actions.getVideo();
      if (
        !videoSource ||
        !Number.isFinite(videoSource.duration) ||
        videoSource.duration <= 0
      )
        return;
      videoSource.currentTime =
        (Number(progress.value) / 1000) * videoSource.duration;
      update();
    });
    progress.addEventListener("pointermove", (event) => {
      const videoSource = actions.getVideo();
      if (
        !videoSource ||
        !Number.isFinite(videoSource.duration) ||
        videoSource.duration <= 0
      )
        return;
      const progressRect = progress.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      if (progressRect.width <= 0 || controlsRect.width <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, (event.clientX - progressRect.left) / progressRect.width),
      );
      timeTooltip.textContent = actions.formatTime(
        videoSource.duration * ratio,
      );
      timeTooltip.hidden = false;
      const halfWidth = timeTooltip.offsetWidth / 2;
      timeTooltip.style.left = `${Math.max(halfWidth, Math.min(controlsRect.width - halfWidth, event.clientX - controlsRect.left))}px`;
    });
    progress.addEventListener("pointerleave", () => {
      timeTooltip.hidden = true;
    });
    win.addEventListener(
      "wheel",
      (event) => {
        if (!(event.metaKey || event.ctrlKey) || event.deltaY === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const currentWidth = win.outerWidth;
        const currentHeight = win.outerHeight;
        const aspectRatio = currentWidth / currentHeight;
        const scale = event.deltaY < 0 ? 1.05 : 0.95;
        let height = Math.round(currentHeight * scale);
        const width = Math.round(height * aspectRatio);
        if (Math.abs(width / height - aspectRatio) >= 1e-5)
          height = Math.round(width / aspectRatio);
        void actions.resize(win.innerWidth, width, height).catch(() => {});
      },
      { capture: true, passive: false },
    );
    win.addEventListener("pointerdown", () => actions.playMirroredVideo(), {
      passive: true,
    });
    win.addEventListener(
      "pointermove",
      () => {
        const videoSource = actions.getVideo();
        if (ui.video.paused && videoSource && !videoSource.paused)
          actions.playMirroredVideo();
      },
      { once: true, passive: true },
    );

    return ui;
  }
  return { create };
})();
