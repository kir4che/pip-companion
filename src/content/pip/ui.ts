"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.PipUI = (() => {
  const t = globalThis.PipCompanion.util.getMessage;

  function create(win: Window, actions: PipUiActions, video: HTMLVideoElement) {
    const doc = win.document;
    const seekVideo = (
      videoSource: HTMLVideoElement,
      targetSeconds: number,
    ) => {
      if (globalThis.PipCompanion.site.isNetflixHost(location.hostname)) {
        window.postMessage(
          { type: "PIP_NETFLIX_SEEK", targetSeconds },
          location.origin,
        );
        return;
      }
      videoSource.currentTime = targetSeconds;
    };
    doc.documentElement.lang = globalThis.PipCompanion.util.getHtmlLanguage();

    const style = doc.createElement("style");
    const baseCss = `
      * {
        box-sizing: border-box;
        -webkit-user-select: none;
        user-select: none;
        scrollbar-color: #ffffff55 transparent;
        scrollbar-width: thin;
      }
      *::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      *::-webkit-scrollbar-track {
        background: transparent;
      }
      *::-webkit-scrollbar-thumb {
        border: 1px solid transparent;
        border-radius: 999px;
        background: #ffffff55;
        background-clip: padding-box;
      }
      *::-webkit-scrollbar-thumb:hover {
        background: #ffffff88;
        background-clip: padding-box;
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
        left: 50%;
        width: fit-content;
        max-width: 92%;
        bottom: var(--subtitle-bottom-offset, 10%);
        transform: translate(-50%, var(--subtitle-bottom-offset, 10%));
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 0.35em;
        padding: 0.55em 1.1em 0.62em;
        border-radius: 0.35em;
        background: var(--subtitle-background, rgba(48, 50, 52, 0.8));
        pointer-events: none;
      }
      .subtitle-line {
        display: block;
        text-align: center;
        width: max-content;
        max-width: 100%;
        white-space: nowrap;
        line-height: var(--subtitle-line-height, 1.35);
      }
      .subtitle-pair {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: max-content;
        max-width: 100%;
        gap: var(--subtitle-pair-gap, 0.35em);
      }
      .subtitle-pair--wrapped {
        width: 100%;
      }
      .subtitle-line--wrapped {
        width: 100%;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .subtitle-segment {
        display: inline;
        padding: 0;
        background: transparent;
        color: var(--subtitle-text-color, #fff);
        font-family: var(
          --subtitle-font-family,
          "YouTube Noto", Roboto, Arial, sans-serif
        );
        font-size: clamp(
          12px,
          var(--subtitle-fit-font-size, var(--subtitle-font-size, 4.8cqh)),
          64px
        );
        font-weight: var(--subtitle-font-weight, 400);
        letter-spacing: var(--subtitle-letter-spacing, 0em);
        -webkit-text-stroke: 0 transparent;
        text-shadow: var(--subtitle-text-shadow, none);
        border-radius: 2px;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }
    `;
    const controlsCss = `
      .controls {
        position: absolute;
        z-index: 60;
        inset: auto 0 0;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 24px 6px 6px;
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
      .danmaku-send-panel {
        position: absolute;
        z-index: 60;
        right: 10px;
        bottom: 40px;
        left: 10px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        background: rgba(12, 12, 12, 0.84);
      }
      .danmaku-send-field {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
      }
      .danmaku-send-input {
        width: 100%;
        height: 26px;
        padding: 0 52px 0 10px;
        border: 0;
        border-radius: 14px;
        outline: none;
        background: transparent;
        color: #fff;
        font: 14px system-ui, sans-serif;
        -webkit-user-select: text;
        user-select: text;
      }
      .danmaku-send-count {
        display: none;
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translateY(-50%);
        color: #aaa;
        font-size: 10px;
        line-height: 1;
        pointer-events: none;
      }
      .danmaku-send-field:focus-within .danmaku-send-count:not([hidden]) {
        display: block;
      }
      .danmaku-send-count.is-over-limit {
        color: #ff7777;
      }
      .danmaku-send-submit {
        width: auto;
        min-width: 48px;
        height: 24px;
        padding: 0 10px;
        border-radius: 14px;
        background: #00a1d6;
        font-size: 12px;
      }
      .danmaku-send-submit:hover {
        background: #12b4e8;
      }
      .danmaku-send-status {
        position: absolute;
        z-index: 60;
        right: 14px;
        bottom: 85px;
        max-width: calc(100% - 28px);
        padding: 4px 8px;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.72);
        font-size: 11px;
        pointer-events: none;
      }
      button {
        flex: 0 0 auto;
        width: 30px;
        height: 30px;
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
        width: 36px;
        font-size: 12px;
        font-weight: 600;
      }
      button:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px #3ea6ff;
        background: #111f;
      }
      input:not([type="range"]):not(.danmaku-send-input):focus-visible {
        outline: none;
        box-shadow: inset 0 -2px 0 #3ea6ff;
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
      .time:has(.time-duration[hidden]) {
        min-width: 0;
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
        touch-action: none;
        transform: scaleY(0.85);
      }
      input[type="range"]:focus {
        outline: none;
      }
      input[type="range"]::-webkit-slider-thumb {
        border-radius: 50%;
      }
      input[type="range"]:focus-visible::-webkit-slider-thumb {
        border-radius: 50%;
        box-shadow: 0 0 0 2px #111, 0 0 0 4px #3ea6ff;
      }
      button svg {
        display: block;
        width: 16px;
        height: 16px;
        fill: currentColor;
      }
      .playlist-button {
        line-height: 0;
      }
      .custom-select {
        position: relative;
        display: block;
        min-width: 0;
        max-width: 100%;
        font: inherit;
      }
      .custom-select-source {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        clip-path: inset(50%) !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .custom-select-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        width: 100%;
        min-width: 0;
        min-height: 32px;
        padding: 5px 9px;
        border: 1px solid #ffffff2e;
        border-radius: 7px;
        background: #ffffff0d;
        color: #f4f4f5;
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color 0.14s ease, background 0.14s ease;
      }
      .custom-select-trigger:hover:not(:disabled) {
        border-color: #ffffff5c;
        background: #ffffff17;
      }
      .custom-select-trigger:focus-visible {
        outline: 2px solid #3ea6ff;
        outline-offset: 2px;
      }
      .custom-select-trigger:disabled {
        opacity: 0.48;
        cursor: not-allowed;
      }
      .custom-select-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .custom-select-chevron {
        flex: 0 0 7px;
        width: 7px;
        height: 7px;
        border-right: 1.5px solid currentColor;
        border-bottom: 1.5px solid currentColor;
        opacity: 0.68;
        transform: rotate(45deg) translateY(-2px);
        transition: transform 0.14s ease;
      }
      .custom-select[data-open="true"] .custom-select-chevron {
        transform: rotate(225deg) translate(-1px, -1px);
      }
      .custom-select-menu {
        position: fixed;
        z-index: 10000;
        overflow: auto;
        padding: 5px;
        border: 1px solid #ffffff24;
        border-radius: 9px;
        background: #171719;
        box-shadow: 0 12px 32px #000b;
        color: #f4f4f5;
      }
      .custom-select-option {
        display: block;
        width: 100%;
        min-height: 30px;
        padding: 6px 9px;
        border: 0;
        border-radius: 5px;
        background: transparent;
        overflow: hidden;
        color: inherit;
        font: inherit;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;
      }
      .custom-select-option:hover,
      .custom-select-option.is-active {
        background: #ffffff13;
      }
      .custom-select-option[aria-selected="true"] {
        background: #3ea6ff22;
        color: #9bd2ff;
      }
      .custom-select-option:disabled {
        color: #ffffff52;
        cursor: not-allowed;
      }
      .custom-select-group-label {
        padding: 8px 9px 4px;
        color: #a1a1aa;
        font-size: 10px;
        font-weight: 650;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .playlist-button img {
        display: block;
        width: 17px;
        height: 17px;
        filter: invert(1);
        transform: translate(-0.5px, -0.5px);
      }
      .playlist-panel {
        position: absolute;
        z-index: 80;
        right: 8px;
        bottom: 48px;
        width: min(360px, calc(100% - 16px));
        max-height: min(70%, 360px);
        overflow: auto;
        padding: 8px;
        border: 1px solid #ffffff22;
        border-radius: 10px;
        background: #111f;
        box-shadow: 0 8px 28px #000b;
      }
      .subtitle-translation-panel {
        position: absolute;
        z-index: 80;
        right: 8px;
        bottom: 48px;
        width: min(280px, calc(100% - 16px));
        max-height: min(75%, 360px);
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px solid #ffffff22;
        border-radius: 10px;
        background: #111f;
        box-shadow: 0 8px 28px #000b;
        font-size: 12px;
      }
      .subtitle-translation-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 28px;
      }
      .subtitle-translation-row > span,
      .subtitle-translation-row > label {
        min-width: 0;
      }
      .subtitle-translation-panel .custom-select {
        flex: 0 1 58%;
        width: 58%;
      }
      .subtitle-translation-panel .custom-select-trigger {
        min-height: 30px;
        padding: 4px 8px;
        border-color: #ffffff2e;
        border-radius: 6px;
        background: #ffffff0d;
        font-size: 11px;
      }
      .subtitle-translation-panel .custom-select-menu {
        z-index: 10001;
        font-size: 11px;
      }
      .subtitle-translation-panel input[type="checkbox"] {
        accent-color: #3ea6ff;
      }
      .subtitle-translation-toggle {
        position: relative;
        flex: none;
        width: 34px;
        height: 20px;
        margin: 0;
        appearance: none;
        border: 1px solid #ffffff50;
        border-radius: 999px;
        background: #ffffff2a;
        cursor: pointer;
        transition:
          background-color 120ms ease,
          border-color 120ms ease;
      }
      .subtitle-translation-toggle::before {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #fff;
        content: "";
        transition: transform 120ms ease;
      }
      .subtitle-translation-toggle:checked {
        border-color: #3ea6ff;
        background: #3ea6ff;
      }
      .subtitle-translation-toggle:checked::before {
        transform: translateX(14px);
      }
      .subtitle-translation-toggle:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }
      .subtitle-translation-toggle:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
      .subtitle-translation-hint-icon {
        position: relative;
        display: inline-grid;
        place-items: center;
        width: 14px;
        height: 14px;
        margin-left: 6px;
        border: 1px solid #ffffff50;
        border-radius: 50%;
        color: #a1a1aa;
        font-size: 10px;
        line-height: 1;
        vertical-align: 1px;
        cursor: help;
      }
      .subtitle-translation-hint-tooltip {
        position: absolute;
        z-index: 1000;
        width: max-content;
        max-width: min(280px, calc(100% - 16px));
        padding: 6px 8px;
        border: 1px solid #ffffff24;
        border-radius: 6px;
        background: #171719;
        color: #f4f4f5;
        font-size: 11px;
        font-weight: 400;
        line-height: 1.5;
        white-space: normal;
        text-align: left;
        pointer-events: none;
      }
      .subtitle-translation-hint-icon:focus {
        outline: none;
      }
      .subtitle-translation-hint-icon:focus-visible {
        outline: 2px solid #3ea6ff;
        outline-offset: 1px;
      }
      @media (prefers-reduced-motion: reduce) {
        .subtitle-translation-toggle,
        .subtitle-translation-toggle::before {
          transition: none;
        }
      }
      .playlist-item {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 34px;
        padding: 6px 8px;
        border-radius: 6px;
        background: transparent;
        text-align: left;
        font-size: 12px;
      }
      .playlist-item.current {
        background: rgba(225, 29, 72, 0.15);
        color: #fb7185;
      }
      .playlist-item:hover,
      .playlist-item:focus-visible {
        background: rgba(225, 29, 72, 0.15);
      }
      .playlist-item.current:hover,
      .playlist-item.current:focus-visible {
        background: rgba(225, 29, 72, 0.2);
      }
      .playlist-index { flex: 0 0 28px; color: #999; font-variant-numeric: tabular-nums; }
      .playlist-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .playlist-duration { flex: 0 0 auto; margin-left: auto; padding-left: 8px; color: #999; font-variant-numeric: tabular-nums; }
    `;
    const popoverCss = `
      .volume-control,
      .speed-control {
        position: relative;
        flex: 0 0 auto;
        height: 30px;
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
          gap: 3px;
          padding-inline: 4px;
        }
        .controls button {
          width: 28px;
          height: 28px;
        }
        .controls .speed-button {
          width: 34px;
        }
        .translation-button {
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
      @media (hover: none) {
        .controls {
          opacity: 1;
          transform: none;
          pointer-events: auto;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .controls,
        .mini-progress,
        .time-tooltip,
        .volume-popover,
        .speed-popover,
        .playlist-panel {
          transition: none;
          scroll-behavior: auto;
        }
        .feedback[data-mode="icon"] {
          animation: none;
        }
      }
      @media (forced-colors: active) {
        :focus-visible {
          outline: 2px solid Highlight !important;
          outline-offset: 2px;
          box-shadow: none !important;
        }
        input[type="range"]:focus-visible {
          outline: none !important;
        }
        input[type="range"]:focus-visible::-webkit-slider-thumb {
          outline: 2px solid Highlight;
          outline-offset: 2px;
          box-shadow: none;
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
    miniProgress.setAttribute("aria-label", t("pipProgress"));
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

    const clearTimeTooltipThumb = () => {
      timeTooltip.classList.remove("has-thumb");
      timeTooltipThumb.style.display = "none";
      timeTooltipThumb.style.backgroundImage = "none";
    };

    const makeButton = (action: string, label: string, ariaLabel: string) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      return button;
    };

    const danmakuSendToggle = makeButton(
      "danmaku-send-toggle",
      "",
      t("pipDanmakuInputOpen"),
    );
    danmakuSendToggle.title = t("pipDanmakuInputOpen");
    const danmakuSendIcon = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    danmakuSendIcon.setAttribute("viewBox", "0 0 24 24");
    danmakuSendIcon.setAttribute("aria-hidden", "true");
    const danmakuSendBubble = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    danmakuSendBubble.setAttribute(
      "d",
      "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16z",
    );
    danmakuSendBubble.setAttribute("fill-rule", "evenodd");
    danmakuSendIcon.append(danmakuSendBubble);
    for (const x of [8, 12, 16]) {
      const dot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", "10");
      dot.setAttribute("r", "1");
      danmakuSendIcon.append(dot);
    }
    danmakuSendToggle.append(danmakuSendIcon);
    danmakuSendToggle.hidden = !actions.canSendDanmaku;
    danmakuSendToggle.setAttribute("aria-expanded", "false");
    const danmakuSendPanel = doc.createElement("form");
    danmakuSendPanel.id = "danmaku-send-panel";
    danmakuSendPanel.className = "danmaku-send-panel";
    danmakuSendToggle.setAttribute("aria-controls", danmakuSendPanel.id);
    danmakuSendPanel.hidden = true;
    const danmakuSendField = doc.createElement("div");
    danmakuSendField.className = "danmaku-send-field";
    const danmakuSendInput = doc.createElement("input");
    danmakuSendInput.className = "danmaku-send-input";
    danmakuSendInput.type = "text";
    danmakuSendInput.autocomplete = "off";
    danmakuSendInput.setAttribute("aria-label", t("pipChatMessage"));
    const danmakuSendCount = doc.createElement("span");
    danmakuSendCount.className = "danmaku-send-count";
    danmakuSendCount.id = "danmaku-send-count";
    danmakuSendInput.setAttribute("aria-describedby", danmakuSendCount.id);
    danmakuSendField.append(danmakuSendInput, danmakuSendCount);
    const danmakuSendSubmit = doc.createElement("button");
    danmakuSendSubmit.className = "danmaku-send-submit";
    danmakuSendSubmit.type = "submit";
    danmakuSendSubmit.textContent = t("pipSend");
    danmakuSendPanel.append(danmakuSendField, danmakuSendSubmit);
    const danmakuSendStatus = doc.createElement("div");
    danmakuSendStatus.className = "danmaku-send-status";
    danmakuSendStatus.setAttribute("role", "status");
    danmakuSendStatus.setAttribute("aria-live", "polite");
    danmakuSendStatus.hidden = true;

    const playButton = makeButton("play", "▶", t("pipPlayVideo"));
    const nextButton = makeButton("next", "", t("pipNextEpisode"));
    nextButton.hidden = true;
    const playlistButton = makeButton("playlist", "", t("pipPlaylist"));
    playlistButton.className = "playlist-button";
    playlistButton.hidden = true;
    playlistButton.setAttribute("aria-expanded", "false");
    const playlistIcon = doc.createElement("img");
    const playlistIconUrl = globalThis.chrome?.runtime?.getURL?.(
      "assets/playlist-icon.svg",
    );
    if (playlistIconUrl) playlistIcon.src = playlistIconUrl;
    playlistIcon.alt = "";
    playlistIcon.setAttribute("aria-hidden", "true");
    playlistButton.append(playlistIcon);
    const translationButton = doc.createElement("button");
    translationButton.type = "button";
    translationButton.className = "translation-button";
    translationButton.hidden = true;
    translationButton.setAttribute("aria-expanded", "false");
    translationButton.setAttribute("aria-haspopup", "true");
    const translationIcon = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    translationIcon.setAttribute("viewBox", "0 0 24 24");
    translationIcon.setAttribute("aria-hidden", "true");
    const translationPath = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    translationPath.setAttribute(
      "d",
      "M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-11 7H8.5v-1H7v4h1.5v-1H10v1c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm9 0h-1.5v-1H16v4h1.5v-1H19v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z",
    );
    translationIcon.append(translationPath);
    translationButton.append(translationIcon);
    const translationPanel = doc.createElement("section");
    translationPanel.id = "pip-subtitle-translation-panel";
    translationPanel.className = "subtitle-translation-panel";
    translationPanel.hidden = true;
    translationPanel.setAttribute("aria-label", t("pipTranslationSettings"));
    translationButton.setAttribute("aria-controls", translationPanel.id);
    const subtitlePrimaryRow = doc.createElement("label");
    subtitlePrimaryRow.className = "subtitle-translation-row";
    const subtitlePrimaryText = doc.createElement("span");
    subtitlePrimaryText.textContent = t("pipSubtitleTrack");
    const subtitlePrimaryTrack = doc.createElement("select");
    subtitlePrimaryTrack.setAttribute("aria-label", t("pipSubtitleTrack"));
    subtitlePrimaryRow.append(subtitlePrimaryText, subtitlePrimaryTrack);
    const translationServiceRow = doc.createElement("label");
    translationServiceRow.className = "subtitle-translation-row";
    const translationServiceText = doc.createElement("span");
    const translationServiceLabel = doc.createTextNode(
      t("pipTranslationSource"),
    );
    const translationServiceHintIcon = doc.createElement("span");
    translationServiceHintIcon.className = "subtitle-translation-hint-icon";
    translationServiceHintIcon.textContent = "?";
    translationServiceHintIcon.setAttribute(
      "data-tip",
      t("pipTranslationSourceHelp"),
    );
    translationServiceHintIcon.tabIndex = 0;
    translationServiceHintIcon.setAttribute("role", "img");
    translationServiceHintIcon.setAttribute(
      "aria-label",
      t("pipTranslationSourceHelp"),
    );
    const translationServiceHintTooltip = doc.createElement("div");
    translationServiceHintTooltip.id = "pip-subtitle-translation-hint";
    translationServiceHintTooltip.className =
      "subtitle-translation-hint-tooltip";
    translationServiceHintTooltip.setAttribute("role", "tooltip");
    translationServiceHintTooltip.hidden = true;
    translationServiceHintTooltip.textContent = t("pipTranslationSourceHelp");
    translationServiceHintIcon.setAttribute(
      "aria-describedby",
      translationServiceHintTooltip.id,
    );
    translationServiceText.append(
      translationServiceLabel,
      translationServiceHintIcon,
    );
    const translationService = doc.createElement("select");
    translationService.setAttribute("aria-label", t("pipTranslationSource"));
    const nativeSubtitleOption = doc.createElement("option");
    nativeSubtitleOption.value = "none";
    nativeSubtitleOption.textContent = t("pipTranslationNoService");
    translationService.append(nativeSubtitleOption);
    const translationProviders: {
      provider: SubtitleTranslationProvider;
      label: string;
    }[] = [
      { provider: "microsoft", label: "Microsoft Translator" },
      { provider: "google", label: "Google Cloud Translation" },
      { provider: "deepl", label: "DeepL API" },
    ];
    for (const { provider, label } of translationProviders) {
      const option = doc.createElement("option");
      option.value = provider;
      option.textContent = label;
      option.disabled = true;
      translationService.append(option);
    }
    translationServiceRow.append(translationServiceText, translationService);
    const translationEnabledRow = doc.createElement("label");
    translationEnabledRow.className = "subtitle-translation-row";
    const translationEnabledText = doc.createElement("span");
    translationEnabledText.textContent = t("pipTranslationEnable");
    const translationEnabled = doc.createElement("input");
    translationEnabled.type = "checkbox";
    translationEnabled.className = "subtitle-translation-toggle";
    translationEnabled.setAttribute("role", "switch");
    translationEnabled.setAttribute("aria-label", t("pipTranslationEnable"));
    translationEnabledRow.append(translationEnabledText, translationEnabled);
    const subtitlesEnabledRow = doc.createElement("label");
    subtitlesEnabledRow.className = "subtitle-translation-row";
    const subtitlesEnabledText = doc.createElement("span");
    subtitlesEnabledText.textContent = t("pipSubtitlesToggle");
    const subtitlesEnabled = doc.createElement("input");
    subtitlesEnabled.type = "checkbox";
    subtitlesEnabled.className = "subtitle-translation-toggle";
    subtitlesEnabled.setAttribute("role", "switch");
    subtitlesEnabled.setAttribute("aria-label", t("pipSubtitlesToggle"));
    subtitlesEnabledRow.append(subtitlesEnabledText, subtitlesEnabled);
    const translationModeRow = doc.createElement("label");
    translationModeRow.className = "subtitle-translation-row";
    const translationModeText = doc.createElement("span");
    translationModeText.textContent = t("pipTranslationDisplayMode");
    const translationMode = doc.createElement("select");
    translationMode.setAttribute("aria-label", t("pipTranslationDisplayMode"));
    for (const [value, key] of [
      ["bilingual", "pipTranslationBilingual"],
      ["translation-only", "pipTranslationOnly"],
    ] as const) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = t(key);
      translationMode.append(option);
    }
    translationModeRow.append(translationModeText, translationMode);
    const translationLanguageRow = doc.createElement("label");
    translationLanguageRow.className = "subtitle-translation-row";
    const translationLanguageText = doc.createElement("span");
    translationLanguageText.textContent = t("pipTranslationLanguage");
    const translationLanguage = doc.createElement("select");
    translationLanguage.setAttribute("aria-label", t("pipTranslationLanguage"));
    let subtitleTranslationLanguages =
      globalThis.PipCompanion.subtitleTranslationSettings.LANGUAGES.map(
        (code) => ({
          code,
          label:
            globalThis.PipCompanion.subtitleTranslationSettings.getLanguageLabel(
              code,
            ),
        }),
      );
    for (const language of subtitleTranslationLanguages) {
      const option = doc.createElement("option");
      option.value = language.code;
      option.textContent = language.label;
      translationLanguage.append(option);
    }
    translationLanguageRow.append(translationLanguageText, translationLanguage);
    const preferNativeRow = doc.createElement("label");
    preferNativeRow.className = "subtitle-translation-row";
    const preferNativeText = doc.createElement("span");
    preferNativeText.textContent = t("pipTranslationPreferNative");
    const preferNative = doc.createElement("input");
    preferNative.type = "checkbox";
    preferNative.setAttribute("aria-label", t("pipTranslationPreferNative"));
    preferNativeRow.append(preferNativeText, preferNative);
    translationPanel.append(
      subtitlesEnabledRow,
      subtitlePrimaryRow,
      translationEnabledRow,
      translationServiceRow,
      translationLanguageRow,
      translationModeRow,
      preferNativeRow,
    );
    const blurActiveElementWithin = (container: Element) => {
      const activeElement = doc.activeElement;
      if (
        activeElement &&
        container.contains(activeElement) &&
        "blur" in activeElement &&
        typeof activeElement.blur === "function"
      )
        activeElement.blur();
    };
    const playlistPanel = doc.createElement("section");
    playlistPanel.id = "pip-playlist-panel";
    playlistPanel.className = "playlist-panel";
    playlistButton.setAttribute("aria-controls", playlistPanel.id);
    playlistPanel.hidden = true;
    playlistPanel.setAttribute("aria-label", t("pipPlaylist"));
    const nextIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    nextIcon.setAttribute("viewBox", "0 0 24 24");
    nextIcon.setAttribute("aria-hidden", "true");
    const nextPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    nextPath.setAttribute("d", "M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z");
    nextIcon.append(nextPath);
    nextButton.append(nextIcon);

    const speedButton = makeButton("speed", "1×", t("pipPlaybackSpeed", "1×"));
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
    timeCurrent.setAttribute("aria-label", t("pipCurrentTime"));
    const timeDuration = doc.createElement("span");
    timeDuration.className = "time-duration";
    timeDuration.textContent = "/ 0:00";
    timeGroup.append(timeCurrent, timeDuration);
    const progress = doc.createElement("input");
    progress.className = "progress";
    progress.type = "range";
    progress.min = "0";
    progress.max = "1000";
    const progressMax = Number(progress.max);
    progress.value = "0";
    progress.setAttribute("aria-label", t("pipProgress"));
    const volumeControl = doc.createElement("div");
    volumeControl.className = "volume-control";
    const volumeButton = makeButton("volume", "", t("pipVolumeControl"));
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
    volumeValue.setAttribute("aria-label", t("pipVolumeValue"));
    volumeValue.setAttribute("inputmode", "numeric");
    volumeValue.maxLength = 3;
    const volumeSlider = doc.createElement("input");
    volumeSlider.className = "volume-slider";
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "300";
    volumeSlider.step = "1";
    volumeSlider.value = "100";
    volumeSlider.setAttribute("aria-label", t("pipVolume"));
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
    speedSlider.setAttribute("aria-label", t("pipSpeed"));
    speedPopover.append(speedSlider);
    speedControl.append(speedButton, speedPopover);
    controls.append(
      timeTooltip,
      danmakuSendToggle,
      playButton,
      nextButton,
      timeGroup,
      progress,
      volumeControl,
      speedControl,
      translationButton,
      playlistButton,
    );
    screen.append(
      subtitle,
      feedback,
      danmakuSendStatus,
      danmakuSendPanel,
      playlistPanel,
      translationPanel,
      miniProgress,
      controls,
      translationServiceHintTooltip,
    );
    app.append(screen);
    doc.head.replaceChildren(style);
    doc.body.replaceChildren(app);
    const pipSelects = [
      subtitlePrimaryTrack,
      translationService,
      translationMode,
      translationLanguage,
    ];
    for (const select of pipSelects)
      globalThis.PipCompanion.customSelect.enhance(select);
    doc.title = t("pipTitle");

    const refreshShortcuts = () => {
      const format = (key: ShortcutKey) =>
        globalThis.PipCompanion.util.formatShortcut(
          actions.getShortcut(key),
          true,
        );
      const setAriaShortcuts = (element: HTMLElement, keys: ShortcutKey[]) => {
        const value = keys.map(format).filter(Boolean).join(" ");
        if (value) element.setAttribute("aria-keyshortcuts", value);
        else element.removeAttribute("aria-keyshortcuts");
      };
      setAriaShortcuts(playButton, ["pipPlayPauseShortcut"]);
      setAriaShortcuts(speedButton, [
        "pipPlaybackRateDownShortcut",
        "pipPlaybackRateUpShortcut",
      ]);
      setAriaShortcuts(volumeButton, ["pipMuteShortcut"]);
    };
    refreshShortcuts();

    const refreshSubtitleTracks = () => {
      const tracks = actions.getSubtitleTracks();
      if (actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack)
        refreshSubtitleTranslationPreferences();
      const hasSubtitleSource = actions.hasSubtitleSource();
      translationButton.hidden = !hasSubtitleSource;
      if (translationButton.hidden) {
        translationPanel.hidden = true;
        translationButton.setAttribute("aria-expanded", "false");
      }
      subtitlePrimaryRow.hidden = tracks.length === 0;
      subtitlePrimaryTrack.disabled = tracks.length < 2;
      if (subtitlePrimaryRow.hidden) {
        subtitlePrimaryTrack.replaceChildren();
        subtitlePrimaryTrack.dataset.signature = "";
        return;
      }
      const signature = [t("pipSubtitleTrackChoose")]
        .concat(
          tracks.map((track) => `${track.id}:${track.label}:${track.selected}`),
        )
        .join("|");
      if (subtitlePrimaryTrack.dataset.signature === signature) return;
      subtitlePrimaryTrack.dataset.signature = signature;
      subtitlePrimaryTrack.replaceChildren();
      if (tracks.length > 1 && !tracks.some((track) => track.selected)) {
        const placeholder = doc.createElement("option");
        placeholder.value = "";
        placeholder.textContent = t("pipSubtitleTrackChoose");
        placeholder.selected = true;
        subtitlePrimaryTrack.append(placeholder);
      }
      for (const track of tracks) {
        const option = doc.createElement("option");
        option.value = track.id;
        option.textContent = track.label;
        option.selected = track.selected || tracks.length === 1;
        subtitlePrimaryTrack.append(option);
      }
    };
    subtitlePrimaryTrack.addEventListener("change", () => {
      if (!subtitlePrimaryTrack.value) return;
      actions.selectSubtitleTrack(subtitlePrimaryTrack.value);
    });
    let hasNativeSecondaryTracks = false;
    const refreshTranslationLanguageOptions = () => {
      const preferences = actions.getSubtitleTranslationPreferences();
      translationLanguage.replaceChildren();
      if (preferences.useNativeSecondaryTrack) {
        const tracks = actions.getSecondarySubtitleTracks();
        const selectedTrack = actions.getSelectedSecondarySubtitleTrack();
        hasNativeSecondaryTracks = tracks.length > 0;
        if (!tracks.length) {
          const option = doc.createElement("option");
          option.value = "";
          option.textContent = t("pipTranslationNoSecondaryTracks");
          option.disabled = true;
          option.selected = true;
          translationLanguage.append(option);
        } else if (!selectedTrack) {
          const option = doc.createElement("option");
          option.value = "";
          option.textContent = t("pipTranslationChooseSecondaryTrack");
          option.disabled = true;
          option.selected = true;
          translationLanguage.append(option);
        }
        for (const track of tracks) {
          const option = doc.createElement("option");
          option.value = track.id;
          option.textContent = track.label;
          option.selected = track.id === selectedTrack;
          translationLanguage.append(option);
        }
        translationLanguage.value = selectedTrack;
        return;
      }

      hasNativeSecondaryTracks = false;
      const selectedLanguage = preferences.targetLanguage;
      for (const language of subtitleTranslationLanguages) {
        const localizedLabel =
          globalThis.PipCompanion.subtitleTranslationSettings.getLanguageLabel(
            language.code,
          );
        const label =
          localizedLabel === language.code ? language.label : localizedLabel;
        const option = doc.createElement("option");
        option.value = language.code;
        option.textContent = label;
        translationLanguage.append(option);
      }
      if (
        selectedLanguage &&
        !Array.from(translationLanguage.options).some(
          (option) => option.value === selectedLanguage,
        )
      ) {
        const option = doc.createElement("option");
        option.value = selectedLanguage;
        option.textContent =
          globalThis.PipCompanion.subtitleTranslationSettings.getLanguageLabel(
            selectedLanguage,
          );
        translationLanguage.append(option);
      }
      translationLanguage.value = selectedLanguage;
    };
    let translationServicesRequestId = 0;
    let activeTranslationServiceConfigured = false;
    const refreshSubtitleTranslationServices = () => {
      const requestId = ++translationServicesRequestId;
      if (!actions.getSubtitlesEnabled()) {
        translationService.disabled = true;
        return;
      }
      void actions.getSubtitleTranslationServices().then((result) => {
        if (requestId !== translationServicesRequestId) return;
        if (result) {
          activeTranslationServiceConfigured = false;
          for (const option of Array.from(translationService.options)) {
            if (option.value === "none") {
              option.disabled = false;
              continue;
            }
            const service = result.services.find(
              (item) => item.provider === option.value,
            );
            option.disabled = service?.configured !== true;
            if (result.provider === option.value)
              activeTranslationServiceConfigured = service?.configured === true;
          }
          translationService.value = actions.getSubtitleTranslationPreferences()
            .useNativeSecondaryTrack
            ? "none"
            : result.provider;
        }
        translationService.disabled = false;
        refreshSubtitleTranslationPreferences();
      });
    };
    const refreshSubtitleTranslationPreferences = () => {
      const preferences = actions.getSubtitleTranslationPreferences();
      const subtitlesEnabledValue = actions.getSubtitlesEnabled();
      if (!subtitlesEnabledValue) {
        translationServicesRequestId++;
        translationLanguageRequestId++;
        activeTranslationServiceConfigured = false;
        translationService.disabled = true;
      }
      refreshTranslationLanguageOptions();
      const canUseSelectedSource = preferences.useNativeSecondaryTrack
        ? hasNativeSecondaryTracks
        : activeTranslationServiceConfigured;
      translationEnabled.checked =
        preferences.enabled && !actions.isSubtitleTranslationSuspended();
      subtitlesEnabled.checked = subtitlesEnabledValue;
      translationMode.value = preferences.mode;
      if (!preferences.useNativeSecondaryTrack)
        translationLanguage.value = preferences.targetLanguage;
      preferNative.checked = preferences.preferNative;
      translationServiceLabel.textContent = t("pipTranslationSource");
      translationMode.options[0]!.textContent = t(
        preferences.useNativeSecondaryTrack
          ? "pipTranslationOriginalAndSecondary"
          : "pipTranslationBilingual",
      );
      translationMode.options[1]!.textContent = t(
        preferences.useNativeSecondaryTrack
          ? "pipTranslationSecondaryOnly"
          : "pipTranslationOnly",
      );
      translationLanguageText.textContent = t("pipTranslationLanguage");
      preferNativeRow.hidden = preferences.useNativeSecondaryTrack;
      translationLanguageRow.hidden = false;
      translationModeRow.hidden = false;
      translationEnabled.disabled =
        !subtitlesEnabledValue || !canUseSelectedSource;
      subtitlesEnabled.disabled = false;
      translationMode.disabled =
        !subtitlesEnabledValue || !canUseSelectedSource;
      translationLanguage.disabled =
        !subtitlesEnabledValue || !canUseSelectedSource;
      preferNative.disabled =
        !subtitlesEnabledValue ||
        preferences.useNativeSecondaryTrack ||
        !canUseSelectedSource;
      translationButton.setAttribute(
        "aria-pressed",
        String(
          preferences.enabled && !actions.isSubtitleTranslationSuspended(),
        ),
      );
    };
    const positionTranslationServiceHintTooltip = () => {
      if (translationServiceHintTooltip.hidden) return;
      const iconRect = translationServiceHintIcon.getBoundingClientRect();
      const screenRect = screen.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const maxLeft =
        screen.clientWidth - translationServiceHintTooltip.offsetWidth - margin;
      let left = iconRect.left - screenRect.left;
      let top = iconRect.bottom - screenRect.top + gap;
      if (
        top + translationServiceHintTooltip.offsetHeight >
        screen.clientHeight - margin
      )
        top =
          iconRect.top -
          screenRect.top -
          translationServiceHintTooltip.offsetHeight -
          gap;
      left = Math.max(margin, Math.min(left, maxLeft));
      top = Math.max(margin, top);
      translationServiceHintTooltip.style.left = `${left}px`;
      translationServiceHintTooltip.style.top = `${top}px`;
    };
    const showTranslationServiceHintTooltip = () => {
      translationServiceHintTooltip.hidden = false;
      positionTranslationServiceHintTooltip();
    };
    const hideTranslationServiceHintTooltip = () => {
      translationServiceHintTooltip.hidden = true;
    };
    translationServiceHintIcon.addEventListener(
      "pointerenter",
      showTranslationServiceHintTooltip,
    );
    translationServiceHintIcon.addEventListener(
      "pointerleave",
      hideTranslationServiceHintTooltip,
    );
    translationServiceHintIcon.addEventListener(
      "focus",
      showTranslationServiceHintTooltip,
    );
    translationServiceHintIcon.addEventListener(
      "blur",
      hideTranslationServiceHintTooltip,
    );
    translationPanel.addEventListener(
      "scroll",
      positionTranslationServiceHintTooltip,
    );
    win.addEventListener("resize", positionTranslationServiceHintTooltip);
    const saveSubtitleTranslationPreferences = (
      patch: Partial<SubtitleTranslationPreferences>,
    ) =>
      actions.setSubtitleTranslationPreferences({
        ...actions.getSubtitleTranslationPreferences(),
        ...patch,
      });
    let translationLanguageRequestId = 0;
    const refreshAvailableTranslationLanguages = () => {
      const requestId = ++translationLanguageRequestId;
      if (
        !actions.getSubtitlesEnabled() ||
        actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
      )
        return;
      void actions.getSubtitleTranslationLanguages().then((languages) => {
        if (requestId !== translationLanguageRequestId) return;
        if (!languages.length) return;
        subtitleTranslationLanguages = languages;
        refreshTranslationLanguageOptions();
      });
    };
    const normalizeLanguageTag = (code: string) =>
      code.trim().replace(/_/g, "-").toLowerCase();
    const languageTagsMatch = (left: string, right: string) => {
      const a = normalizeLanguageTag(left);
      const b = normalizeLanguageTag(right);
      return (
        Boolean(a && b) &&
        (a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`))
      );
    };
    const isLanguageTag = (code: string) =>
      code.length > 0 &&
      code.length <= 35 &&
      /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code);
    translationService.addEventListener("change", () => {
      if (translationService.value === "none") {
        const preferences = actions.getSubtitleTranslationPreferences();
        saveSubtitleTranslationPreferences({ useNativeSecondaryTrack: true });
        // 切到原生時，沿用目標語言自動挑軌；沒有相符軌就不動，不硬選。
        const match = actions
          .getSecondarySubtitleTracks()
          .find((track) =>
            languageTagsMatch(track.language ?? "", preferences.targetLanguage),
          );
        if (match && match.id !== actions.getSelectedSecondarySubtitleTrack())
          actions.selectSecondarySubtitleTrack(match.id);
        refreshSubtitleTranslationPreferences();
        return;
      }
      const provider = translationService.value as SubtitleTranslationProvider;
      translationService.disabled = true;
      void actions.setSubtitleTranslationProvider(provider).then((saved) => {
        activeTranslationServiceConfigured = saved;
        if (!saved) actions.showFeedback(t("pipTranslationServiceUnavailable"));
        else {
          // 切到機器翻譯時，把已選原生軌的語言帶成目標語言，帶不過去才保留原值。
          const selectedSecondary = actions
            .getSecondarySubtitleTracks()
            .find(
              (track) =>
                track.id === actions.getSelectedSecondarySubtitleTrack(),
            );
          const carriedLanguage =
            selectedSecondary?.language &&
            isLanguageTag(selectedSecondary.language)
              ? selectedSecondary.language
              : actions.getSubtitleTranslationPreferences().targetLanguage;
          saveSubtitleTranslationPreferences({
            useNativeSecondaryTrack: false,
            targetLanguage: carriedLanguage,
          });
        }
        refreshSubtitleTranslationServices();
        if (saved && actions.getSubtitleTranslationPreferences().enabled)
          refreshAvailableTranslationLanguages();
      });
    });
    translationEnabled.addEventListener("change", () => {
      const enabled = translationEnabled.checked;
      if (enabled) actions.resumeSubtitleTranslation();
      saveSubtitleTranslationPreferences({ enabled });
      if (
        enabled &&
        !actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
      )
        refreshAvailableTranslationLanguages();
    });
    subtitlesEnabled.addEventListener("change", () => {
      actions.toggleSubtitles();
      refreshSubtitleTranslationPreferences();
      if (actions.getSubtitlesEnabled()) refreshSubtitleTranslationServices();
    });
    translationMode.addEventListener("change", () =>
      saveSubtitleTranslationPreferences({
        mode:
          translationMode.value === "bilingual"
            ? "bilingual"
            : "translation-only",
      }),
    );
    translationLanguage.addEventListener("change", () => {
      const preferences = actions.getSubtitleTranslationPreferences();
      if (preferences.useNativeSecondaryTrack) {
        if (
          !actions.getSelectedSecondarySubtitleTrack() &&
          preferences.mode !== "bilingual"
        )
          saveSubtitleTranslationPreferences({ mode: "bilingual" });
        actions.selectSecondarySubtitleTrack(translationLanguage.value);
      } else
        saveSubtitleTranslationPreferences({
          targetLanguage:
            translationLanguage.value as SubtitleTranslationLanguage,
        });
    });
    preferNative.addEventListener("change", () =>
      saveSubtitleTranslationPreferences({
        preferNative: preferNative.checked,
      }),
    );
    const closeTranslationPanel = () => {
      blurActiveElementWithin(translationPanel);
      translationPanel.hidden = true;
      translationButton.setAttribute("aria-expanded", "false");
    };
    const isTranslationTarget = (target: EventTarget | null) =>
      target !== null &&
      (translationPanel.contains(target as Node) ||
        translationButton.contains(target as Node) ||
        [
          subtitlePrimaryTrack,
          translationService,
          translationMode,
          translationLanguage,
        ].some((select) =>
          globalThis.PipCompanion.customSelect.containsTarget(select, target),
        ));
    const isTranslationPanelFocusTarget = (target: EventTarget | null) =>
      target !== null &&
      (translationPanel.contains(target as Node) ||
        [
          subtitlePrimaryTrack,
          translationService,
          translationMode,
          translationLanguage,
        ].some((select) =>
          globalThis.PipCompanion.customSelect.containsTarget(select, target),
        ));
    translationButton.addEventListener("click", (e) => {
      const open = translationPanel.hidden;
      translationPanel.hidden = !open;
      translationButton.setAttribute("aria-expanded", String(open));
      if (open) {
        refreshSubtitleTracks();
        refreshSubtitleTranslationServices();
        refreshSubtitleTranslationPreferences();
        if (e.detail === 0) translationEnabled.focus();
        const preferences = actions.getSubtitleTranslationPreferences();
        if (
          actions.getSubtitlesEnabled() &&
          preferences.enabled &&
          !preferences.useNativeSecondaryTrack
        )
          refreshAvailableTranslationLanguages();
      }
    });
    screen.addEventListener(
      "pointerdown",
      (e) => {
        if (!translationPanel.hidden && !isTranslationTarget(e.target))
          closeTranslationPanel();
      },
      { capture: true },
    );
    screen.addEventListener(
      "focusin",
      (e) => {
        if (!translationPanel.hidden && !isTranslationTarget(e.target))
          closeTranslationPanel();
      },
      { capture: true },
    );
    win.addEventListener(
      "keydown",
      (e) => {
        if (
          translationPanel.hidden ||
          e.key !== "Escape" ||
          globalThis.PipCompanion.customSelect.isOpenForTarget(e.target)
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTranslationPanel();
        translationButton.focus();
      },
      { capture: true },
    );

    const refreshLocale = () => {
      doc.documentElement.lang = globalThis.PipCompanion.util.getHtmlLanguage();
      doc.title = t("pipTitle");
      miniProgress.setAttribute("aria-label", t("pipProgress"));
      const danmakuInputLabel = t(
        danmakuSendPanel.hidden
          ? "pipDanmakuInputOpen"
          : "pipDanmakuInputClose",
      );
      danmakuSendToggle.setAttribute("aria-label", danmakuInputLabel);
      danmakuSendToggle.title = danmakuInputLabel;
      danmakuSendInput.setAttribute("aria-label", t("pipChatMessage"));
      danmakuSendSubmit.textContent =
        danmakuCooldownUntil > Date.now()
          ? t(
              "pipCooldownSeconds",
              String(Math.ceil((danmakuCooldownUntil - Date.now()) / 1000)),
            )
          : t("pipSend");
      nextButton.setAttribute("aria-label", t("pipNextEpisode"));
      playlistButton.setAttribute("aria-label", t("pipPlaylist"));
      playlistPanel.setAttribute("aria-label", t("pipPlaylist"));
      speedButton.setAttribute(
        "aria-label",
        t("pipPlaybackSpeed", speedButton.textContent ?? "1×"),
      );
      timeCurrent.setAttribute("aria-label", t("pipCurrentTime"));
      progress.setAttribute("aria-label", t("pipProgress"));
      volumeButton.setAttribute("aria-label", t("pipVolumeControl"));
      volumeValue.setAttribute("aria-label", t("pipVolumeValue"));
      volumeSlider.setAttribute("aria-label", t("pipVolume"));
      speedSlider.setAttribute("aria-label", t("pipSpeed"));
      subtitlePrimaryText.textContent = t("pipSubtitleTrack");
      subtitlePrimaryTrack.setAttribute("aria-label", t("pipSubtitleTrack"));
      translationPanel.setAttribute("aria-label", t("pipTranslationSettings"));
      translationServiceLabel.textContent = t("pipTranslationSource");
      translationServiceHintIcon.setAttribute(
        "data-tip",
        t("pipTranslationSourceHelp"),
      );
      translationServiceHintTooltip.textContent = t("pipTranslationSourceHelp");
      translationServiceHintIcon.setAttribute(
        "aria-label",
        t("pipTranslationSourceHelp"),
      );
      translationService.setAttribute("aria-label", t("pipTranslationSource"));
      nativeSubtitleOption.textContent = t("pipTranslationNoService");
      translationEnabledText.textContent = t("pipTranslationEnable");
      translationEnabled.setAttribute("aria-label", t("pipTranslationEnable"));
      subtitlesEnabledText.textContent = t("pipSubtitlesToggle");
      subtitlesEnabled.setAttribute("aria-label", t("pipSubtitlesToggle"));
      translationModeText.textContent = t("pipTranslationDisplayMode");
      translationMode.setAttribute(
        "aria-label",
        t("pipTranslationDisplayMode"),
      );
      translationLanguageText.textContent = t("pipTranslationLanguage");
      translationLanguage.setAttribute(
        "aria-label",
        t("pipTranslationLanguage"),
      );
      translationMode.options[0]!.textContent = t(
        actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
          ? "pipTranslationOriginalAndSecondary"
          : "pipTranslationBilingual",
      );
      translationMode.options[1]!.textContent = t(
        actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
          ? "pipTranslationSecondaryOnly"
          : "pipTranslationOnly",
      );
      refreshTranslationLanguageOptions();
      preferNativeText.textContent = t("pipTranslationPreferNative");
      preferNative.setAttribute("aria-label", t("pipTranslationPreferNative"));
      translationButton.setAttribute("aria-label", t("pipTranslationSettings"));
      translationButton.title = t("pipTranslationSettings");
      refreshSubtitleTracks();
      refreshSubtitleTranslationPreferences();
      refreshSubtitleTranslationServices();
      actions.updatePlaybackUi();
    };

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
      playlistButton,
      playlistPanel,
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
      dispose: () => {
        for (const select of pipSelects)
          globalThis.PipCompanion.customSelect.disposeForSelect(select);
      },
      refreshLocale,
      refreshShortcuts,
      refreshSubtitleTranslationPreferences,
      refreshSubtitleTranslationServices,
      refreshSubtitleTranslationLanguages: () => {
        const preferences = actions.getSubtitleTranslationPreferences();
        if (
          !translationPanel.hidden &&
          preferences.enabled &&
          !preferences.useNativeSecondaryTrack
        ) {
          refreshAvailableTranslationLanguages();
        } else {
          translationLanguageRequestId++;
          if (preferences.useNativeSecondaryTrack)
            refreshTranslationLanguageOptions();
        }
      },
      setDanmakuEnabled: (enabled: boolean) => setDanmakuEnabled(enabled),
      setThumbnailPreviewEnabled: (enabled: boolean) => {
        if (!enabled) clearTimeTooltipThumb();
      },
      refreshSubtitleTracks,
    };

    const update = () => actions.updatePlaybackUi();
    const togglePlayback = () => actions.togglePlayback();
    let danmakuSendStatusTimer: number | undefined;
    const setDanmakuSendStatus = (message: string | null) => {
      if (danmakuSendStatusTimer !== undefined) {
        win.clearTimeout(danmakuSendStatusTimer);
        danmakuSendStatusTimer = undefined;
      }
      if (message === null || danmakuSendPanel.hidden) {
        danmakuSendStatus.textContent = "";
        danmakuSendStatus.hidden = true;
        return;
      }
      danmakuSendStatus.textContent = message;
      danmakuSendStatus.hidden = false;
      danmakuSendStatusTimer = win.setTimeout(() => {
        danmakuSendStatusTimer = undefined;
        if (danmakuSendStatus.textContent === message)
          setDanmakuSendStatus(null);
      }, 3000);
    };
    const setDanmakuSendPanelOpen = (open: boolean) => {
      danmakuSendPanel.hidden = !open;
      danmakuSendToggle.setAttribute("aria-expanded", String(open));
      const label = open ? t("pipDanmakuInputClose") : t("pipDanmakuInputOpen");
      danmakuSendToggle.setAttribute("aria-label", label);
      danmakuSendToggle.title = label;
    };
    const openDanmakuSendPanel = () => {
      if (!danmakuEnabled || !actions.canSendDanmaku) return;
      setDanmakuSendPanelOpen(true);
      refreshDanmakuCharacterLimit();
      danmakuSendInput.focus();
    };
    const closeDanmakuSendPanel = () => {
      blurActiveElementWithin(danmakuSendPanel);
      setDanmakuSendPanelOpen(false);
      setDanmakuSendStatus(null);
    };
    let danmakuEnabled = true;
    let sendingDanmaku = false;
    let danmakuCharacterLimit: number | null = null;
    let danmakuCooldownUntil = 0;
    let danmakuCooldownTimer: number | undefined;
    const setDanmakuEnabled = (enabled: boolean) => {
      danmakuEnabled = enabled;
      danmakuSendToggle.hidden = !enabled || !actions.canSendDanmaku;
      danmakuSendInput.disabled = !enabled || !actions.canSendDanmaku;
      danmakuSendSubmit.disabled =
        !enabled ||
        !actions.canSendDanmaku ||
        sendingDanmaku ||
        danmakuCooldownUntil > Date.now();
      if (!enabled) {
        closeDanmakuSendPanel();
        danmakuSendInput.blur();
      }
    };
    const updateDanmakuCharacterCount = () => {
      const length = danmakuSendInput.value.length;
      danmakuSendCount.textContent =
        danmakuCharacterLimit === null
          ? ""
          : `${length} / ${danmakuCharacterLimit}`;
      danmakuSendCount.hidden = danmakuCharacterLimit === null;
      danmakuSendCount.classList.toggle(
        "is-over-limit",
        danmakuCharacterLimit !== null && length > danmakuCharacterLimit,
      );
    };
    const refreshDanmakuCharacterLimit = () => {
      danmakuCharacterLimit = actions.getDanmakuCharacterLimit();
      if (danmakuCharacterLimit === null)
        danmakuSendInput.removeAttribute("maxlength");
      else danmakuSendInput.maxLength = danmakuCharacterLimit;
      updateDanmakuCharacterCount();
    };
    const updateDanmakuCooldown = () => {
      const remaining = danmakuCooldownUntil - Date.now();
      if (remaining <= 0) {
        danmakuCooldownUntil = 0;
        danmakuCooldownTimer = undefined;
        danmakuSendSubmit.textContent = t("pipSend");
        danmakuSendSubmit.disabled =
          !danmakuEnabled || !actions.canSendDanmaku || sendingDanmaku;
        return;
      }
      danmakuSendSubmit.disabled = true;
      danmakuSendSubmit.textContent = t(
        "pipCooldownSeconds",
        String(Math.ceil(remaining / 1000)),
      );
      danmakuCooldownTimer = win.setTimeout(
        updateDanmakuCooldown,
        Math.min(1000, remaining),
      );
    };
    const sendDanmaku = async () => {
      if (!danmakuEnabled || !actions.canSendDanmaku || sendingDanmaku) return;
      if (danmakuCooldownUntil > Date.now()) {
        const seconds = Math.ceil((danmakuCooldownUntil - Date.now()) / 1000);
        setDanmakuSendStatus(t("pipWaitToSend", String(seconds)));
        return;
      }
      if (danmakuCooldownTimer !== undefined)
        win.clearTimeout(danmakuCooldownTimer);
      danmakuCooldownTimer = undefined;
      danmakuCooldownUntil = 0;
      danmakuSendSubmit.textContent = t("pipSend");
      danmakuSendSubmit.disabled = false;

      refreshDanmakuCharacterLimit();
      if (!danmakuSendInput.value.trim()) {
        setDanmakuSendStatus(t("pipEnterDanmaku"));
        return;
      }
      if (
        danmakuCharacterLimit !== null &&
        danmakuSendInput.value.length > danmakuCharacterLimit
      ) {
        setDanmakuSendStatus(
          t("pipDanmakuTooLong", String(danmakuCharacterLimit)),
        );
        return;
      }

      setDanmakuSendStatus(null);
      sendingDanmaku = true;
      const sendStartedAt = Date.now();
      const submittedText = danmakuSendInput.value;
      danmakuSendSubmit.disabled = true;
      try {
        const result = await actions.sendDanmaku(submittedText);
        if (result.ok) {
          danmakuCooldownUntil = sendStartedAt + 5000;
          if (
            result.nativeInputCleared &&
            danmakuSendInput.value === submittedText
          ) {
            danmakuSendInput.value = "";
            updateDanmakuCharacterCount();
          }
          updateDanmakuCooldown();
        } else setDanmakuSendStatus(t("pipSendUnavailable"));
      } catch {
        setDanmakuSendStatus(t("pipSendFailed"));
      } finally {
        sendingDanmaku = false;
        if (danmakuCooldownUntil === 0) {
          danmakuSendSubmit.disabled =
            !danmakuEnabled || !actions.canSendDanmaku;
          danmakuSendSubmit.textContent = t("pipSend");
        }
      }
    };
    refreshDanmakuCharacterLimit();
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
    danmakuSendToggle.addEventListener("click", () => {
      if (!danmakuEnabled || !actions.canSendDanmaku) return;
      if (danmakuSendPanel.hidden) openDanmakuSendPanel();
      else closeDanmakuSendPanel();
    });
    danmakuSendPanel.addEventListener("submit", (e) => {
      e.preventDefault();
      void sendDanmaku();
    });
    danmakuSendInput.addEventListener("input", updateDanmakuCharacterCount);
    danmakuSendInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && e.isComposing) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeDanmakuSendPanel();
        danmakuSendToggle.focus();
      }
    });
    danmakuSendPanel.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeDanmakuSendPanel();
      danmakuSendToggle.focus();
    });
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
    const closePlaylist = () => {
      blurActiveElementWithin(playlistPanel);
      playlistPanel.hidden = true;
      playlistButton.setAttribute("aria-expanded", "false");
    };
    const isPlaylistTarget = (target: EventTarget | null) =>
      target !== null &&
      (playlistPanel.contains(target as Node) ||
        playlistButton.contains(target as Node));
    const isPlaylistPanelFocusTarget = (target: EventTarget | null) =>
      target !== null && playlistPanel.contains(target as Node);
    let playlistCloseTimer = 0;
    win.addEventListener("pointerleave", () => {
      const activeElement = doc.activeElement;
      if (!isPlaylistPanelFocusTarget(activeElement)) closePlaylist();
      if (!isTranslationPanelFocusTarget(activeElement))
        closeTranslationPanel();
      if (!danmakuSendPanel.contains(activeElement)) closeDanmakuSendPanel();
    });
    screen.addEventListener("pointerenter", () => {
      win.clearTimeout(playlistCloseTimer);
    });
    screen.addEventListener("pointerleave", (event) => {
      if (
        pipSelects.some((select) =>
          globalThis.PipCompanion.customSelect.containsTarget(
            select,
            event.relatedTarget,
          ),
        )
      )
        return;
      win.clearTimeout(playlistCloseTimer);
      playlistCloseTimer = win.setTimeout(() => {
        const activeElement = doc.activeElement;
        if (
          activeElement?.matches(":focus-visible") &&
          (isPlaylistPanelFocusTarget(activeElement) ||
            isTranslationPanelFocusTarget(activeElement) ||
            pipSelects.some((select) =>
              globalThis.PipCompanion.customSelect.containsTarget(
                select,
                activeElement,
              ),
            ))
        )
          return;
        closePlaylist();
        closeTranslationPanel();
        for (const select of pipSelects)
          globalThis.PipCompanion.customSelect.closeForSelect(select);
      }, 250);
    });
    screen.addEventListener(
      "pointerdown",
      (e) => {
        if (!playlistPanel.hidden && !isPlaylistTarget(e.target))
          closePlaylist();
      },
      { capture: true },
    );
    screen.addEventListener(
      "focusin",
      (e) => {
        if (!playlistPanel.hidden && !isPlaylistTarget(e.target))
          closePlaylist();
      },
      { capture: true },
    );
    win.addEventListener(
      "keydown",
      (e) => {
        if (playlistPanel.hidden) return;
        if (e.key === "Escape") {
          closePlaylist();
          playlistButton.focus();
          return;
        }
        const inPlaylistPanel = playlistPanel.contains(e.target as Node);
        const onPlaylistButton = playlistButton.contains(e.target as Node);
        const buttonKey = ["Enter", " ", "Tab"].includes(e.key);
        if (!((inPlaylistPanel || onPlaylistButton) && buttonKey))
          closePlaylist();
      },
      { capture: true },
    );
    const renderPlaylist = () => {
      const playlist = actions.getPlaylist();
      playlistPanel.replaceChildren();
      if (!playlist || playlist.items.length < 2) {
        playlistButton.hidden = true;
        closePlaylist();
        return;
      }
      let currentEntry: HTMLButtonElement | null = null;
      for (const item of playlist.items) {
        const entry = doc.createElement("button");
        entry.type = "button";
        entry.className = "playlist-item";
        if (
          playlist.currentIndexKnown &&
          item.index === playlist.currentIndex
        ) {
          entry.classList.add("current");
          entry.setAttribute("aria-current", "true");
          currentEntry = entry;
        }
        entry.setAttribute(
          "aria-label",
          `${item.index + 1}. ${item.title}${item.duration ? `, ${item.duration}` : ""}`,
        );
        const index = doc.createElement("span");
        index.className = "playlist-index";
        index.textContent = String(item.index + 1).padStart(2, "0");
        const title = doc.createElement("span");
        title.className = "playlist-title";
        title.textContent = item.title;
        entry.append(index, title);
        if (item.duration) {
          const duration = doc.createElement("span");
          duration.className = "playlist-duration";
          duration.textContent = item.duration;
          entry.append(duration);
        }
        entry.addEventListener("click", () => {
          actions.selectPlaylistItem(item.index);
          closePlaylist();
          playlistButton.focus();
        });
        playlistPanel.append(entry);
      }
      playlistPanel.hidden = false;
      playlistButton.setAttribute("aria-expanded", "true");
      if (currentEntry)
        win.requestAnimationFrame(() => {
          const panelRect = playlistPanel.getBoundingClientRect();
          const entryRect = currentEntry?.getBoundingClientRect();
          if (!entryRect || playlistPanel.clientHeight === 0) return;
          playlistPanel.scrollTop +=
            entryRect.top -
            panelRect.top -
            (playlistPanel.clientHeight - currentEntry.clientHeight) / 2;
        });
    };
    playlistButton.addEventListener("click", () => {
      if (playlistPanel.hidden) renderPlaylist();
      else closePlaylist();
    });

    volumeSlider.addEventListener("input", () =>
      actions.setVolume(
        Number(volumeSlider.value),
        Number(volumeSlider.value) > 0,
      ),
    );
    speedSlider.addEventListener("input", () => {
      const videoSource = actions.getVideo();
      if (!videoSource) return;
      actions.cancelNextPlaybackRestore();
      videoSource.playbackRate = Number(speedSlider.value);
      update();
      showSpeedFeedback();
    });
    const releaseRangeFocus = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      (event.currentTarget as HTMLInputElement).blur();
    };
    for (const slider of [volumeSlider, speedSlider]) {
      slider.addEventListener("pointerup", releaseRangeFocus);
      slider.addEventListener("pointercancel", releaseRangeFocus);
      slider.addEventListener("lostpointercapture", releaseRangeFocus);
    }

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
        actions.showFeedback(t("pipTimeInvalid"));
        return false;
      }
      const duration = videoSource.duration;
      const target =
        Number.isFinite(duration) && duration > 0
          ? Math.max(0, Math.min(duration, seconds))
          : Math.max(0, seconds);
      seekVideo(videoSource, target);
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

    doc.documentElement.addEventListener("pointerenter", () => {
      if (!doc.hasFocus()) win.focus();
    });

    win.addEventListener("keydown", (e) => {
      const matches = (key: ShortcutKey) => actions.matchesShortcut(e, key);
      if (
        matches("pipDanmakuInputShortcut") &&
        danmakuEnabled &&
        actions.canSendDanmaku &&
        danmakuSendPanel.hidden &&
        (e.target === video ||
          e.target === screen ||
          e.target === doc.body ||
          e.target === doc.documentElement)
      ) {
        e.preventDefault();
        e.stopPropagation();
        openDanmakuSendPanel();
        return;
      }
      if (
        e.target === volumeValue ||
        e.target === timeCurrent ||
        e.target === danmakuSendInput
      )
        return;
      const target = e.target instanceof Element ? e.target : null;
      const videoSource = actions.getVideo();
      if (videoSource && matches("pipPlayPauseShortcut")) {
        e.preventDefault();
        e.stopPropagation();
        togglePlayback();
        return;
      }
      const frameBackward = matches("pipFrameStepBackwardShortcut");
      const frameForward = matches("pipFrameStepForwardShortcut");
      if (
        videoSource &&
        !e.repeat &&
        (frameBackward || frameForward) &&
        !target?.closest?.("input[type='range']")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const backward = frameBackward;
        const next = videoSource.currentTime + (backward ? -1 : 1) / 60;
        if (Number.isFinite(next) && next >= 0) seekVideo(videoSource, next);
        actions.showFrameStepIcon(backward);
        return;
      }
      const decreaseRate = matches("pipPlaybackRateDownShortcut");
      const increaseRate = matches("pipPlaybackRateUpShortcut");
      if (videoSource && (decreaseRate || increaseRate)) {
        e.preventDefault();
        e.stopPropagation();
        adjustPlaybackRate(decreaseRate ? -1 : 1);
        return;
      }
      if (videoSource && !e.repeat && matches("pipAutoFitShortcut")) {
        e.preventDefault();
        e.stopPropagation();
        const aspectRatio = videoSource.videoWidth / videoSource.videoHeight;
        if (
          videoSource.videoWidth <= 0 ||
          videoSource.videoHeight <= 0 ||
          !Number.isFinite(aspectRatio)
        )
          return;

        let width = win.outerWidth;
        let height = win.outerHeight;
        if (win.innerWidth / win.innerHeight < aspectRatio)
          height = Math.round(
            win.outerHeight - win.innerHeight + win.innerWidth / aspectRatio,
          );
        else
          width = Math.round(
            win.outerWidth - win.innerWidth + win.innerHeight * aspectRatio,
          );

        void actions.resize(win.innerWidth, width, height).catch(() => {});
        return;
      }
      if (videoSource && matches("pipToggleSubtitlesShortcut")) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleSubtitles();
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
      const volumeUp = matches("pipVolumeUpShortcut");
      const volumeDown = matches("pipVolumeDownShortcut");
      const mute = matches("pipMuteShortcut");
      const seekBackward = matches("pipSeekBackwardShortcut");
      const seekForward = matches("pipSeekForwardShortcut");
      const rangeFocused = Boolean(target?.closest?.("input[type='range']"));
      if (
        !videoSource ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        (target?.closest?.(
          "button, input, select, textarea, [contenteditable='true']",
        ) &&
          !(
            mute ||
            (rangeFocused &&
              (volumeUp || volumeDown || seekBackward || seekForward))
          ))
      )
        return;
      if (rangeFocused && (seekBackward || seekForward)) return;

      if (seekBackward || seekForward) {
        if (!Number.isFinite(videoSource.duration) || videoSource.duration <= 0)
          return;
        const delta = seekBackward
          ? -actions.getSeekSeconds()
          : actions.getSeekSeconds();
        seekVideo(
          videoSource,
          Math.max(
            0,
            Math.min(videoSource.duration, videoSource.currentTime + delta),
          ),
        );
      } else if (volumeUp || volumeDown) {
        const delta = volumeUp ? 10 : -10;
        const next = Math.max(
          0,
          Math.min(actions.getMaxVolume(), actions.getVolumePercent() + delta),
        );
        actions.setVolume(next, delta > 0);
        actions.showVolumeFeedback();
      } else if (mute) toggleMute();
      else return;

      e.preventDefault();
      e.stopPropagation();
      update();
    });

    let seekingPointerId: number | null = null;
    const progressRatioAt = (clientX: number) => {
      const rect = progress.getBoundingClientRect();
      if (rect.width <= 0) return null;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };
    const progressTimeAtRatio = (
      videoSource: HTMLVideoElement,
      ratio: number,
    ) => videoSource.duration * ratio;
    const seekProgressToRatio = (
      videoSource: HTMLVideoElement,
      ratio: number,
    ) => {
      const targetTime = progressTimeAtRatio(videoSource, ratio);
      progress.value = String(Math.round(ratio * progressMax));
      seekVideo(videoSource, targetTime);
      update();
    };

    progress.addEventListener("input", () => {
      if (seekingPointerId !== null) return;
      const videoSource = actions.getVideo();
      if (
        !videoSource ||
        !Number.isFinite(videoSource.duration) ||
        videoSource.duration <= 0
      )
        return;
      seekProgressToRatio(videoSource, Number(progress.value) / progressMax);
    });

    progress.addEventListener(
      "pointerdown",
      (e) => {
        if (progress.disabled) return;
        const ratio = progressRatioAt(e.clientX);
        const videoSource = actions.getVideo();
        if (
          ratio === null ||
          !videoSource ||
          !Number.isFinite(videoSource.duration) ||
          videoSource.duration <= 0
        )
          return;
        e.preventDefault();
        progress.focus({ preventScroll: true });
        seekingPointerId = e.pointerId;
        progress.setPointerCapture(e.pointerId);
        seekProgressToRatio(videoSource, ratio);
      },
      { capture: true },
    );
    const finishSeeking = (e: PointerEvent) => {
      if (seekingPointerId !== e.pointerId) return;
      seekingPointerId = null;
      progress.blur();
      timeTooltip.hidden = true;
      clearTimeTooltipThumb();
      screen.classList.remove("controls-visible");
    };
    progress.addEventListener("pointerup", finishSeeking);
    progress.addEventListener("pointercancel", finishSeeking);
    progress.addEventListener("lostpointercapture", finishSeeking);

    progress.addEventListener("pointermove", (e) => {
      const videoSource = actions.getVideo();
      if (
        !videoSource ||
        !Number.isFinite(videoSource.duration) ||
        videoSource.duration <= 0
      )
        return;
      const ratio = progressRatioAt(e.clientX);
      const controlsRect = controls.getBoundingClientRect();
      if (ratio === null || controlsRect.width <= 0) return;
      const targetTime = progressTimeAtRatio(videoSource, ratio);
      timeTooltipText.textContent = actions.formatTime(targetTime);
      if (seekingPointerId === e.pointerId)
        seekProgressToRatio(videoSource, ratio);

      const frame = actions.getStoryboardFrame?.(targetTime);
      if (frame && frame.url) {
        timeTooltip.classList.add("has-thumb");
        timeTooltipThumb.style.display = "block";
        const maxThumbWidth = Math.min(
          frame.width,
          180,
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
        clearTimeTooltipThumb();
      }

      timeTooltip.hidden = false;
      const halfWidth = timeTooltip.offsetWidth / 2;
      timeTooltip.style.left = `${Math.max(halfWidth, Math.min(controlsRect.width - halfWidth, e.clientX - controlsRect.left))}px`;
    });
    progress.addEventListener("pointerleave", () => {
      timeTooltip.hidden = true;
      clearTimeTooltipThumb();
    });

    win.addEventListener(
      "wheel",
      (e) => {
        if (!actions.matchesWheelShortcut(e) || e.deltaY === 0) return;
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
    const scheduleHideControls = () => {
      win.clearTimeout(hideControlsTimer);
      hideControlsTimer = win.setTimeout(
        () => screen.classList.remove("controls-visible"),
        500,
      );
    };
    screen.addEventListener("pointerleave", scheduleHideControls);
    win.addEventListener(
      "pointermove",
      (e) => {
        screen.classList.add("controls-visible");
        win.clearTimeout(hideControlsTimer);
        const target = e.target;
        const ElementCtor = win.document.defaultView?.Element;
        if (
          ElementCtor &&
          target instanceof ElementCtor &&
          target.closest(".controls")
        )
          return;
        scheduleHideControls();
      },
      { passive: true },
    );

    return ui;
  }

  return { create };
})();
