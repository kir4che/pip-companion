"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.PipUI = (() => {
  function create(win: Window, actions: PipUiActions, video: HTMLVideoElement) {
    const doc = win.document;
    doc.documentElement.lang = "zh-Hant";

    const style = doc.createElement("style");
    const baseCss = `
      * {
        box-sizing: border-box;
        -webkit-user-select: none;
        user-select: none;
      }
      input[type="text"] {
        -webkit-user-select: text;
        user-select: text;
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
      html:focus,
      body:focus,
      .app:focus,
      .screen:focus,
      .screen > video:focus {
        outline: none;
      }
    `;
    const contentCss = `
      .screen > video {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        object-fit: contain !important;
        object-position: center !important;
        transform: none !important;
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
    const controlsCss = `
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
      .screen.controls-visible .controls,
      .screen:has(:focus-visible) .controls {
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
      .screen.controls-visible .mini-progress,
      .screen:has(:focus-visible) .mini-progress {
        opacity: 0;
      }
      .time-tooltip {
        position: absolute;
        z-index: 2;
        bottom: 52px;
        left: 0;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 4px 7px;
        border-radius: 6px;
        color: #fff;
        background: #111e;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        pointer-events: none;
      }
      .time-tooltip.has-thumb {
        padding: 4px 4px 6px;
      }
      .time-tooltip-thumb {
        display: none;
        border-radius: 4px;
        overflow: hidden;
        background-color: #000;
        background-repeat: no-repeat;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      .time-tooltip-text {
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
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
        outline: 2px solid #3ea6ff;
        outline-offset: 2px;
      }
      .time {
        flex: 0 0 auto;
        min-width: 78px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .time-current {
        height: 18px;
        padding: 0 2px;
        margin: 0;
        border: 0;
        border-radius: 3px;
        background: transparent;
        color: #fff;
        font-family: inherit;
        font-size: 12px;
        text-align: center;
      }
      .time-current:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .time-current:focus {
        background: rgba(0, 0, 0, 0.65);
        cursor: text;
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
    const popoverCss = `
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
      .volume-control:has(:focus-visible) .volume-popover,
      .speed-control:hover .speed-popover,
      .speed-control:has(:focus-visible) .speed-popover {
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
      .feedback {
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
      .feedback[data-mode="icon"] {
        padding: 0;
        background: none;
        border-radius: 0;
        animation: feedback-pop 0.18s ease-out;
      }
      .feedback svg {
        display: block;
        width: clamp(48px, 16cqmin, 112px);
        height: clamp(48px, 16cqmin, 112px);
        fill: rgba(255, 255, 255, 0.95);
        filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.55));
      }
      @keyframes feedback-pop {
        from {
          transform: translate(-50%, -50%) scale(0.65);
          opacity: 0;
        }
        to {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
      }
    `;
    const responsiveCss = `
      @media (max-width: 440px) {
        .controls {
          gap: 5px;
          padding-inline: 6px;
        }
        .controls button {
          width: 28px;
          height: 28px;
        }
        .controls .speed-button {
          width: 34px;
        }
        .time {
          min-width: 55px;
        }
        .volume-slider,
        .speed-slider {
          height: 84px;
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
        .feedback[data-mode="icon"] {
          animation: none;
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
    const subtitle = doc.createElement("div");
    subtitle.className = "subtitle";
    const feedback = doc.createElement("div");
    feedback.className = "feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    feedback.hidden = true;
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
    const timeTooltip = doc.createElement("div");
    timeTooltip.className = "time-tooltip";
    timeTooltip.hidden = true;
    timeTooltip.setAttribute("aria-hidden", "true");
    const timeTooltipThumb = doc.createElement("div");
    timeTooltipThumb.className = "time-tooltip-thumb";
    const timeTooltipText = doc.createElement("span");
    timeTooltipText.className = "time-tooltip-text";
    timeTooltip.append(timeTooltipThumb, timeTooltipText);

    const makeButton = (action: string, label: string, ariaLabel: string) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      return button;
    };

    const playButton = makeButton("play", "▶", "播放影片");
    const nextButton = makeButton("next", "", "下一部影片");
    nextButton.hidden = true;
    const nextIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    nextIcon.setAttribute("viewBox", "0 0 24 24");
    nextIcon.setAttribute("aria-hidden", "true");
    const nextPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    nextPath.setAttribute("d", "M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z");
    nextIcon.append(nextPath);
    nextButton.append(nextIcon);

    const speedButton = makeButton("speed", "1×", "播放速度 1×");
    speedButton.className = "speed-button";
    const timeGroup = doc.createElement("span");
    timeGroup.className = "time";
    const timeCurrent = doc.createElement("input");
    timeCurrent.type = "text";
    timeCurrent.className = "time-current";
    timeCurrent.value = "0:00";
    timeCurrent.size = 4;
    timeCurrent.maxLength = 12;
    timeCurrent.setAttribute("inputmode", "numeric");
    timeCurrent.setAttribute("aria-label", "目前時間，輸入後按 Enter 跳轉");
    const timeDuration = doc.createElement("span");
    timeDuration.className = "time-duration";
    timeDuration.textContent = "/ 0:00";
    timeGroup.append(timeCurrent, timeDuration);
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
    speedSlider.min = "0.25";
    speedSlider.max = "5";
    speedSlider.step = "0.05";
    speedSlider.value = "1";
    speedSlider.setAttribute("aria-label", "播放速度");
    speedPopover.append(speedSlider);
    speedControl.append(speedButton, speedPopover);
    controls.append(
      timeTooltip,
      playButton,
      nextButton,
      timeGroup,
      progress,
      volumeControl,
      speedControl,
    );
    screen.append(subtitle, feedback, miniProgress, controls);
    app.append(screen);
    doc.head.replaceChildren(style);
    doc.body.replaceChildren(app);
    doc.title = "幕伴 PiP";

    const ui = {
      video,
      screen,
      subtitle,
      feedback,
      volumeValue,
      volumeButton,
      volumePath,
      playButton,
      nextButton,
      speedControl,
      speedButton,
      speedSlider,
      volumeSlider,
      progress,
      timeCurrent,
      timeDuration,
      miniProgress,
      miniProgressFill,
      timeTooltip,
      timeTooltipThumb,
      timeTooltipText,
    };

    const update = () => actions.updatePlaybackUi();
    const togglePlayback = () => actions.togglePlayback();
    const showSpeedFeedback = () => {
      const rate = actions.getVideo()?.playbackRate;
      if (rate) actions.showFeedback(`${Math.round(rate * 100) / 100}×`);
    };
    const adjustPlaybackRate = (direction: number) => {
      actions.adjustPlaybackRate(direction);
      showSpeedFeedback();
    };
    const togglePlaybackRate = () => {
      actions.togglePlaybackRate();
      showSpeedFeedback();
    };
    const toggleMute = () => actions.toggleMute();

    volumeButton.addEventListener("click", toggleMute);
    speedButton.addEventListener("click", togglePlaybackRate);
    playButton.addEventListener("click", togglePlayback);
    screen.addEventListener(
      "click",
      (e) => {
        if (e.target !== screen && e.target !== video) return;
        e.stopPropagation();
        togglePlayback();
      },
      { capture: true },
    );
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
      } else update();
    };
    volumeValue.addEventListener("click", () => volumeValue.select());
    volumeValue.addEventListener("focus", () => volumeValue.select());
    volumeValue.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        commitVolumeInput();
        volumeValue.blur();
      } else if (e.key === "Escape") {
        update();
        volumeValue.blur();
      }
    });
    volumeValue.addEventListener("blur", commitVolumeInput);

    const { parseTime } = globalThis.PipCompanion.util;
    const setTimeInput = (text: string) => {
      timeCurrent.value = text;
      timeCurrent.size = Math.max(4, text.length);
    };
    const renderTimeInput = () => {
      const videoSource = actions.getVideo();
      setTimeInput(actions.formatTime(videoSource?.currentTime ?? 0));
    };
    let timeFocusText = "";
    const commitTimeInput = (): boolean => {
      if (timeCurrent.value.trim() === timeFocusText) return true;
      const videoSource = actions.getVideo();
      const seconds = parseTime(timeCurrent.value);
      if (!videoSource || seconds === null) {
        actions.showFeedback("時間格式錯誤");
        return false;
      }
      const duration = videoSource.duration;
      const target =
        Number.isFinite(duration) && duration > 0
          ? Math.max(0, Math.min(duration, seconds))
          : Math.max(0, seconds);
      videoSource.currentTime = target;
      const text = actions.formatTime(target);
      timeFocusText = text;
      setTimeInput(text);
      return true;
    };
    timeCurrent.addEventListener("click", () => timeCurrent.select());
    timeCurrent.addEventListener("focus", () => {
      renderTimeInput();
      timeFocusText = timeCurrent.value;
      timeCurrent.select();
    });
    timeCurrent.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && commitTimeInput()) timeCurrent.blur();
      else if (e.key === "Escape") {
        renderTimeInput();
        timeFocusText = timeCurrent.value;
        timeCurrent.blur();
      }
    });
    timeCurrent.addEventListener("blur", () => {
      if (!commitTimeInput()) {
        renderTimeInput();
        timeFocusText = timeCurrent.value;
      }
    });

    win.addEventListener("keydown", (e) => {
      if (e.target === volumeValue || e.target === timeCurrent) return;
      const target = e.target instanceof Element ? e.target : null;
      const videoSource = actions.getVideo();
      const plain = !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
      if (plain && e.code === "Space" && videoSource) {
        e.preventDefault();
        e.stopPropagation();
        togglePlayback();
        return;
      }
      if (
        videoSource &&
        !e.repeat &&
        !e.shiftKey &&
        (e.key === "," || e.key === ".") &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !target?.closest?.("input[type='range']")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const backward = e.key === ",";
        const next = videoSource.currentTime + (backward ? -1 : 1) / 60;
        if (Number.isFinite(next) && next >= 0) videoSource.currentTime = next;
        actions.showFrameStepIcon(backward);
        return;
      }
      const decreaseRate = e.shiftKey && e.code === "Comma";
      const increaseRate = e.shiftKey && e.code === "Period";
      if (
        videoSource &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        (decreaseRate || increaseRate)
      ) {
        e.preventDefault();
        e.stopPropagation();
        adjustPlaybackRate(decreaseRate ? -1 : 1);
        return;
      }
      if (
        plain &&
        videoSource &&
        (e.key.toLowerCase() === "c" || e.code === "KeyC")
      ) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleCaptions();
        return;
      }
      if (actions.matchesCommentsShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleComments();
        return;
      }
      if (actions.matchesDanmakuShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleDanmaku();
        return;
      }
      if (actions.matchesScreenshotShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.screenshot();
        return;
      }
      if (actions.matchesLaunchShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.closePip();
        return;
      }
      const key = e.code === "Space" ? " " : e.key.toLowerCase();
      const rangeFocused = Boolean(target?.closest?.("input[type='range']"));
      const volumeKey = key === "arrowup" || key === "arrowdown";
      const directKey = key === "m";
      const horizontalArrow = key === "arrowleft" || key === "arrowright";
      if (
        !videoSource ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.shiftKey ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        (target?.closest?.(
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
        case "m":
          toggleMute();
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
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

    progress.addEventListener("pointermove", (e) => {
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
        Math.min(1, (e.clientX - progressRect.left) / progressRect.width),
      );
      const targetTime = videoSource.duration * ratio;
      timeTooltipText.textContent = actions.formatTime(targetTime);

      const frame = actions.getStoryboardFrame?.(targetTime);
      if (frame && frame.url) {
        timeTooltip.classList.add("has-thumb");
        timeTooltipThumb.style.display = "block";
        const maxThumbWidth = Math.min(
          frame.width,
          Math.max(80, controlsRect.width - 24),
        );
        const scale =
          maxThumbWidth < frame.width ? maxThumbWidth / frame.width : 1;
        const width = Math.round(frame.width * scale);
        const height = Math.round(frame.height * scale);
        timeTooltipThumb.style.width = `${width}px`;
        timeTooltipThumb.style.height = `${height}px`;
        timeTooltipThumb.style.backgroundImage = `url("${frame.url}")`;
        if (frame.sheetWidth && frame.sheetHeight)
          timeTooltipThumb.style.backgroundSize = `${Math.round(frame.sheetWidth * scale)}px ${Math.round(frame.sheetHeight * scale)}px`;
        else timeTooltipThumb.style.backgroundSize = "auto";
        timeTooltipThumb.style.backgroundPosition = `-${Math.round(frame.x * scale)}px -${Math.round(frame.y * scale)}px`;
      } else {
        timeTooltip.classList.remove("has-thumb");
        timeTooltipThumb.style.display = "none";
        timeTooltipThumb.style.backgroundImage = "none";
      }

      timeTooltip.hidden = false;
      const halfWidth = timeTooltip.offsetWidth / 2;
      timeTooltip.style.left = `${Math.max(halfWidth, Math.min(controlsRect.width - halfWidth, e.clientX - controlsRect.left))}px`;
    });
    progress.addEventListener("pointerleave", () => {
      timeTooltip.hidden = true;
      timeTooltip.classList.remove("has-thumb");
      timeTooltipThumb.style.display = "none";
    });

    win.addEventListener(
      "wheel",
      (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.deltaY === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const currentWidth = win.outerWidth;
        const currentHeight = win.outerHeight;
        const aspectRatio = currentWidth / currentHeight;
        const scale = e.deltaY < 0 ? 1.05 : 0.95;
        let height = Math.round(currentHeight * scale);
        const width = Math.round(height * aspectRatio);
        if (Math.abs(width / height - aspectRatio) >= 1e-5)
          height = Math.round(width / aspectRatio);
        void actions.resize(win.innerWidth, width, height).catch(() => {});
      },
      { capture: true, passive: false },
    );

    let hideControlsTimer = 0;
    win.addEventListener(
      "pointermove",
      (e) => {
        screen.classList.add("controls-visible");
        win.clearTimeout(hideControlsTimer);
        const target = e.target as Element | null;
        if (target?.closest?.(".controls")) return;
        hideControlsTimer = win.setTimeout(
          () => screen.classList.remove("controls-visible"),
          1000,
        );
      },
      { passive: true },
    );

    return ui;
  }

  return { create };
})();
