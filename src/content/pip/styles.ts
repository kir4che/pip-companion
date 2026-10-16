"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.PipStyles = {
  get(): string[] {
    return [
      `
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
    `,
      `
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
    `,
      `
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
    `,
      `
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
    `,
      `
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
    `,
    ];
  },
};
