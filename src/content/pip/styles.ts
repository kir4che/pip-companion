"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.PipStyles = {
  get(): string[] {
    return [
      `
      :root,
      .screen {
        --pip-accent: #ff3333;
        --pip-progress-fill: var(--pip-accent, #ff3333);
        --pip-slider-accent: var(--pip-accent, #ff3333);
        --pip-focus-ring: var(--pip-accent, #3ea6ff);
        --pip-toggle-active: var(--pip-accent, #3ea6ff);
        --pip-send-btn: var(--pip-accent, #ff3333);
        --pip-send-btn-hover: color-mix(
          in srgb,
          var(--pip-send-btn) 85%,
          #fff
        );
        --pip-accent-soft: color-mix(
          in srgb,
          var(--pip-accent, #ff3333) 18%,
          transparent
        );
        --pip-accent-contrast: color-mix(
          in srgb,
          var(--pip-accent, #ff3333) 60%,
          #fff
        );
        --pip-accent-light: color-mix(
          in srgb,
          var(--pip-accent, #ff3333) 70%,
          #fff
        );
        --pip-panel-bg: #121214fa;
        --pip-btn-bg: #111b;
        --pip-btn-bg-hover: #444d;
        --pip-border-subtle: rgba(255, 255, 255, 0.14);
        --pip-border-default: rgba(255, 255, 255, 0.22);
      }
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
      .app {
        width: 100%;
        height: 100%;
      }
      .screen {
        position: relative;
        width: 100%;
        height: 100%;
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
      .controls > [data-control-hidden="true"] {
        display: none !important;
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
        background: var(--pip-progress-fill);
      }
      .screen.controls-visible .mini-progress,
      .screen:has(:focus-visible) .mini-progress {
        opacity: 0;
      }
      .time-tooltip {
        position: absolute;
        z-index: 2;
        bottom: 30px;
        left: 0;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 4px 7px;
        border-radius: 6px;
        color: #fff;
        background: var(--pip-panel-bg);
        border: 1px solid var(--pip-border-subtle);
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
        border: 1px solid var(--pip-border-subtle);
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
        border: 1px solid var(--pip-border-subtle);
        border-radius: 16px;
        background: rgba(12, 12, 12, 0.84);
      }
      .danmaku-search-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .danmaku-search-toggle svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      .danmaku-search-panel {
        position: absolute;
        z-index: 85;
        right: 8px;
        bottom: 48px;
        width: min(340px, calc(100% - 16px));
        max-height: min(75%, 360px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 8px;
        border: 1px solid var(--pip-border-default);
        border-radius: 12px;
        background: var(--pip-panel-bg);
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 32px #000c;
        font-size: 12px;
        color: #eee;
      }
      .danmaku-search-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }
      .danmaku-search-input-wrap {
        position: relative;
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 10px;
        border: 1px solid var(--pip-border-subtle);
        border-radius: 14px;
        background: rgba(12, 12, 12, 0.84);
      }
      .danmaku-search-input-wrap:focus-within {
        border-color: rgba(255, 255, 255, 0.32);
      }
      .danmaku-search-input-icon {
        width: 14px;
        height: 14px;
        fill: #888;
        flex-shrink: 0;
      }
      .danmaku-search-input {
        flex: 1 1 auto;
        min-width: 0;
        height: 28px;
        border: 0;
        outline: none;
        background: transparent;
        color: #fff;
        font: 14px system-ui, sans-serif;
      }
      .danmaku-search-input::placeholder {
        color: #888;
        font: 13px system-ui, sans-serif;
      }
      .danmaku-search-clear {
        width: auto;
        height: auto;
        background: transparent;
        color: #888;
        cursor: pointer;
        font-size: 12px;
        padding: 2px 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .danmaku-search-clear:hover {
        color: #fff;
        background: transparent;
      }
      .danmaku-search-clear:focus-visible {
        outline: none;
        box-shadow: none;
        background: transparent;
      }
      .danmaku-search-close {
        background: none;
        color: #aaa;
        font-size: 14px;
        padding: 4px 6px;
      }
      .danmaku-search-close:hover {
        background: #ffffff18;
        color: #fff;
      }
      .danmaku-heat-section {
        margin-top: 4px;
        display: flex;
        flex-direction: column;
      }
      .danmaku-heat-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--pip-accent, #ff3333);
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .danmaku-heat-chips {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .danmaku-heat-status {
        padding: 8px 4px;
        text-align: center;
        color: #888;
        font-size: 11px;
      }
      .danmaku-heat-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 4px 8px;
        background: #ffffff0a;
        border: 1px solid #ffffff12;
        border-radius: 6px;
        color: #eee;
        cursor: pointer;
        text-align: left;
        font-size: 11px;
      }
      .danmaku-heat-chip:hover {
        background: #ff980022;
        border-color: #ff980066;
      }
      .danmaku-heat-rank {
        font-weight: 700;
        color: #ff9800;
        font-size: 10px;
      }
      .danmaku-heat-chip[data-rank="1"] .danmaku-heat-rank {
        color: #ff5252;
      }
      .danmaku-heat-chip[data-rank="2"] .danmaku-heat-rank {
        color: #ff7043;
      }
      .danmaku-heat-chip[data-rank="3"] .danmaku-heat-rank {
        color: #ffb74d;
      }
      .danmaku-heat-time {
        font-family: monospace;
        color: var(--pip-accent-light);
        font-weight: 600;
      }
      .danmaku-heat-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #ccc;
      }
      .danmaku-results-section {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .danmaku-results-count {
        font-size: 10px;
        color: #888;
        margin-bottom: 4px;
      }
      .danmaku-results-list {
        flex: 1 1 auto;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .danmaku-result-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 6px;
        border-radius: 6px;
        cursor: pointer;
      }
      .danmaku-result-item:hover,
      .danmaku-result-item.is-active {
        background: #ffffff18;
      }
      .danmaku-result-time {
        font-family: monospace;
        font-size: 11px;
        color: var(--pip-accent-light);
        font-weight: 600;
        flex-shrink: 0;
      }
      .danmaku-result-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        color: #eee;
      }
      .danmaku-result-mark {
        background: #ffd60044;
        color: #ffe57f;
        border-radius: 2px;
        padding: 0 1px;
      }
      .danmaku-result-count {
        font-size: 10px;
        color: #888;
        background: #ffffff12;
        padding: 1px 4px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .danmaku-search-empty {
        padding: 16px 8px;
        text-align: center;
        color: #777;
        font-size: 11px;
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
        background: var(--pip-send-btn);
        font-size: 12px;
      }
      .danmaku-send-submit:hover {
        background: var(--pip-send-btn-hover);
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
        background: var(--pip-btn-bg);
        font:
          18px/1 system-ui,
          sans-serif;
        cursor: pointer;
      }
      button:hover {
        background: var(--pip-btn-bg-hover);
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
        box-shadow: inset 0 0 0 2px var(--pip-focus-ring);
        background: #111f;
      }
      input:not([type="range"]):not(.danmaku-send-input):not(.danmaku-search-input):focus-visible {
        outline: none;
        box-shadow: inset 0 -2px 0 var(--pip-focus-ring);
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
        accent-color: var(--pip-progress-fill);
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
        box-shadow: 0 0 0 2px #111, 0 0 0 4px var(--pip-focus-ring);
      }
      button svg {
        display: block;
        width: 16px;
        height: 16px;
        fill: currentColor;
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
        outline: 2px solid var(--pip-focus-ring);
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
        border: 1px solid var(--pip-border-default);
        border-radius: 9px;
        background: var(--pip-panel-bg);
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
        background: var(--pip-accent-soft);
        color: var(--pip-accent-contrast);
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
      .playlist-button {
        line-height: 0;
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
        border: 1px solid var(--pip-border-default);
        border-radius: 10px;
        background: var(--pip-panel-bg);
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
        border: 1px solid var(--pip-border-default);
        border-radius: 10px;
        background: var(--pip-panel-bg);
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
        accent-color: var(--pip-toggle-active);
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
        border-color: var(--pip-toggle-active);
        background: var(--pip-toggle-active);
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
        border: 1px solid var(--pip-border-default);
        border-radius: 6px;
        background: var(--pip-panel-bg);
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
        outline: 2px solid var(--pip-focus-ring);
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
        background: var(--pip-accent-soft);
        color: var(--pip-accent-contrast);
      }
      .playlist-item:hover,
      .playlist-item:focus-visible {
        background: rgba(255, 255, 255, 0.15);
      }
      .playlist-item.current:hover,
      .playlist-item.current:focus-visible {
        background: var(--pip-accent-soft);
        filter: brightness(1.2);
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
        background: var(--pip-panel-bg);
        border: 1px solid var(--pip-border-subtle);
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
        border-color: var(--pip-focus-ring);
        cursor: text;
      }
      .volume-slider,
      .speed-slider {
        width: 28px;
        height: 100px;
        margin: 0;
        writing-mode: vertical-lr;
        direction: rtl;
        accent-color: var(--pip-slider-accent);
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
