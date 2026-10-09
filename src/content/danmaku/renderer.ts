"use strict";

interface DanmakuRendererOptions {
  isPip?: boolean;
}

(() => {
  const MAX_VISIBLE_DANMAKU = 100;
  const MAX_PENDING_DANMAKU = 300;
  const PIP_REFERENCE_WIDTH = 640;
  const MIN_PIP_DANMAKU_FONT_SIZE = 10;
  const MAX_PENDING_DANMAKU_DELAY_MS = 250;

  function normalizeDanmakuType(data: DanmakuData): DanmakuType {
    return data.type === "top" || data.type === "bottom" ? data.type : "right";
  }

  function ensureDanmakuStyles(doc: Document): void {
    if (!doc || doc.getElementById("yt-danmaku-styles")) return;
    const style = doc.createElement("style");
    style.id = "yt-danmaku-styles";
    style.textContent = `
    .yt-danmaku-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      pointer-events: none;
      z-index: 55;
      user-select: none;
      contain: layout paint;
    }
    .yt-danmaku-overlay[hidden] {
      display: none !important;
    }
    .yt-danmaku-item {
      position: absolute;
      left: 0;
      white-space: nowrap;
      will-change: transform;
      font-family: "YouTube Noto", Roboto, "Segoe UI", Arial, sans-serif;
      font-weight: 600;
      color: #ffffff;
      text-shadow:
        -1.5px -1.5px 0 #000,
         1.5px -1.5px 0 #000,
        -1.5px  1.5px 0 #000,
         1.5px  1.5px 0 #000,
         0px 1px 3px rgba(0, 0, 0, 0.9);
      line-height: 1.2;
      letter-spacing: 0.02em;
      pointer-events: none;
      animation-name: yt-danmaku-scroll;
      animation-timing-function: linear;
      animation-fill-mode: both;
    }
    .yt-danmaku-item .yt-danmaku-emoji {
      display: inline-block;
      width: auto;
      max-width: 2.5em;
      height: 1.25em;
      object-fit: contain;
      vertical-align: -0.2em;
      letter-spacing: normal;
    }
    .yt-danmaku-overlay.is-paused .yt-danmaku-item {
      animation-play-state: paused;
    }
    .yt-danmaku-item.is-fixed {
      left: 50%;
      transform: translateX(-50%);
      animation: none;
    }
    .yt-danmaku-item.is-advanced {
      animation: none !important;
      transform-origin: top left;
      white-space: pre-wrap;
    }
    .yt-danmaku-advanced-content {
      display: inline-block;
      white-space: pre-wrap;
    }
    .yt-danmaku-item.is-superchat {
      background-color: var(--sc-bg, rgba(15, 157, 88, 0.9));
      color: var(--sc-color, #ffffff);
      padding: 3px 10px;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .yt-danmaku-item .sc-amount {
      font-weight: 800;
      margin-right: 6px;
      padding-right: 6px;
      border-right: 1px solid rgba(255, 255, 255, 0.4);
    }
    @keyframes yt-danmaku-scroll {
      from {
        transform: translate3d(var(--dm-start-x, 1000px), 0, 0);
      }
      to {
        transform: translate3d(calc(-100% - 10px), 0, 0);
      }
    }
  `;

    (doc.head || doc.documentElement).appendChild(style);
  }

  class DanmakuRenderer implements DanmakuRendererHandle {
    container: Element;
    isPip: boolean;
    doc: Document;
    laneAvailableTime: Record<DanmakuType, number[]>;
    overlay: HTMLElement | null = null;
    resizeObserver: ResizeObserver | null = null;
    duration: number;
    playbackRate = 1;
    paused = false;
    clockTime = 0;
    lastClockUpdate: number;
    pendingDanmaku: DanmakuPendingItem[] = [];
    pendingTimer: number | null = null;
    restoreOccupancy: Record<DanmakuType, LaneOccupancy[][]> | null = null;
    laneHeight: number;
    fontSize: number;
    topPadding: number;

    constructor(
      container: Element,
      private readonly dependencies: ContentDanmakuRendererDependencies,
      options: DanmakuRendererOptions = {},
    ) {
      this.container = container;
      this.isPip = Boolean(options.isPip);
      this.doc = container.ownerDocument || document;
      this.laneAvailableTime = { right: [], top: [], bottom: [] };
      this.duration = this.isPip ? 6.5 : 7.5;
      this.lastClockUpdate = performance.now();
      this.laneHeight = this.isPip ? 24 : 34;
      this.fontSize = this.isPip ? 14 : 22;
      this.topPadding = this.isPip ? 8 : 12;

      this.initOverlay();
      const ResizeObserverCtor = this.doc.defaultView?.ResizeObserver;
      if (this.overlay && ResizeObserverCtor) {
        this.resizeObserver = new ResizeObserverCtor(() => this.updateStyle());
        this.resizeObserver.observe(this.overlay);
      }
      this.updateStyle();
    }

    initOverlay(): void {
      ensureDanmakuStyles(this.doc);
      let overlay = this.container.querySelector<HTMLElement>(
        ".yt-danmaku-overlay",
      );
      if (!overlay) {
        overlay = this.doc.createElement("div");
        overlay.className = "yt-danmaku-overlay";
        this.container.appendChild(overlay);
      }
      this.overlay = overlay;
      this.updateVisibility();
      this.recalcLanes();
    }

    private capFontSize(size: number, min = 0): number {
      return Math.max(
        min,
        Math.min(size, this.dependencies.getStyle().maxFontSize),
      );
    }

    updateStyle(): void {
      const baseFontSize = this.isPip ? 14 : 22;
      const baseLaneHeight = this.isPip ? 24 : 34;
      const overlayWidth =
        this.overlay?.clientWidth || (this.isPip ? PIP_REFERENCE_WIDTH : 1280);
      const windowScale = this.isPip ? overlayWidth / PIP_REFERENCE_WIDTH : 1;
      this.fontSize = this.capFontSize(
        baseFontSize *
          (this.dependencies.getStyle().fontSizeScale / 100) *
          windowScale,
        this.isPip ? MIN_PIP_DANMAKU_FONT_SIZE : 0,
      );
      this.laneHeight = baseLaneHeight * (this.fontSize / baseFontSize);
      this.duration =
        (this.isPip ? 6.5 : 7.5) /
        (this.dependencies.getStyle().speedScale / 100);
      if (!this.overlay) return;

      for (const item of this.overlay.querySelectorAll<DanmakuItemElement>(
        ".yt-danmaku-item",
      )) {
        if (item.classList.contains("is-advanced")) {
          const overlayWidth =
            this.overlay.clientWidth || (this.isPip ? 640 : 1280);
          const sourceWidth = Number(item.dataset.sourceWidth || 672);
          const sourceFontSize = Number(item.dataset.sourceFontSize || 25);
          item.style.fontSize = `${this.capFontSize(sourceFontSize * (overlayWidth / sourceWidth) * (this.dependencies.getStyle().fontSizeScale / 100), this.isPip ? MIN_PIP_DANMAKU_FONT_SIZE : 0)}px`;
        } else item.style.fontSize = `${this.fontSize}px`;
        item.style.fontFamily =
          globalThis.PipCompanion.danmakuSettings.FONT_FAMILIES[
            this.dependencies.getStyle().fontFamily
          ];
        item.style.fontWeight = String(this.dependencies.getStyle().fontWeight);
        item.style.opacity = String(this.dependencies.getStyle().opacity / 100);
        const opacityEffect = item.danmakuOpacityAnimation?.effect;
        if (opacityEffect) {
          const opacity = this.dependencies.getStyle().opacity / 100;
          (opacityEffect as KeyframeEffect).setKeyframes([
            { opacity },
            { opacity },
          ]);
        }
        item.style.color = !item.classList.contains("is-superchat")
          ? item.dataset.danmakuColor || ""
          : "";
      }
      this.recalcLanes();
    }

    updateVisibility(): void {
      if (!this.overlay) return;
      this.overlay.hidden = !this.dependencies.isVisible();
      if (!this.dependencies.isVisible()) {
        this.clearPendingTimer();
        this.pendingDanmaku.length = 0;
      } else this.flushPendingDanmaku();
    }

    updateClock(): number {
      const now = performance.now();
      if (!this.paused)
        this.clockTime += (now - this.lastClockUpdate) * this.playbackRate;
      this.lastClockUpdate = now;
      return this.clockTime;
    }

    setPaused(paused: boolean): void {
      this.updateClock();
      this.paused = paused;

      if (paused) this.clearPendingTimer();
      else this.flushPendingDanmaku();
      if (!this.overlay) return;
      if (paused) this.overlay.classList.add("is-paused");
      else this.overlay.classList.remove("is-paused");
      for (const animation of this.overlay.getAnimations({ subtree: true })) {
        if (paused) animation.pause();
        else animation.play();
      }
    }

    setPlaybackRate(rate: number): void {
      this.updateClock();
      this.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
      for (const animation of this.overlay?.getAnimations({ subtree: true }) ||
        []) {
        animation.playbackRate = this.playbackRate;
      }
      this.flushPendingDanmaku();
    }

    clear(): void {
      this.clearPendingTimer();
      this.pendingDanmaku.length = 0;
      this.restoreOccupancy = null;
      if (!this.overlay) return;
      this.overlay.replaceChildren();

      const now = this.updateClock();
      for (const lanes of Object.values(this.laneAvailableTime)) {
        lanes.fill(now);
      }
    }

    beginSeekRestore(): void {
      this.recalcLanes();
      this.restoreOccupancy = {
        right: this.laneAvailableTime.right.map(() => []),
        top: this.laneAvailableTime.top.map(() => []),
        bottom: this.laneAvailableTime.bottom.map(() => []),
      };
    }

    endSeekRestore(): void {
      this.restoreOccupancy = null;
    }

    recalcLanes(): void {
      if (!this.overlay) return;
      const height = this.overlay.clientHeight || (this.isPip ? 360 : 720);
      const usableHeight =
        height * (this.dependencies.getStyle().displayArea / 100) -
        this.topPadding;
      const count = Math.max(1, Math.floor(usableHeight / this.laneHeight));
      const finalCount = Math.min(this.isPip ? MAX_VISIBLE_DANMAKU : 14, count);

      const now = this.updateClock();
      const types: DanmakuType[] = ["right", "top", "bottom"];
      for (const type of types) {
        const prev = this.laneAvailableTime[type];
        if (prev.length === finalCount) continue;
        this.laneAvailableTime[type] = Array.from(
          { length: finalCount },
          (_, index) => prev[index] ?? now,
        );
      }
    }

    emit(data: DanmakuData, options: DanmakuEmitOptions = {}): void {
      if (
        !this.dependencies.isVisible() ||
        !this.overlay ||
        !this.overlay.isConnected
      )
        return;

      if (
        options.restore === true ||
        data.advanced ||
        normalizeDanmakuType(data) === "right"
      ) {
        this.render(data, options);
        return;
      }

      const now = this.updateClock();
      this.discardExpiredDanmaku(now);
      if (this.pendingDanmaku.length >= MAX_PENDING_DANMAKU) return;
      this.pendingDanmaku.push({ data, queuedAt: now });
      this.flushPendingDanmaku();
    }

    discardExpiredDanmaku(now: number): void {
      this.pendingDanmaku = this.pendingDanmaku.filter((entry) => {
        const lifetime =
          entry.data.advanced?.durationMs ??
          (entry.data.type === "top" || entry.data.type === "bottom"
            ? 4000
            : this.duration * 1000);
        return (
          now - entry.queuedAt <
          Math.min(lifetime, MAX_PENDING_DANMAKU_DELAY_MS)
        );
      });
    }

    clearPendingTimer(): void {
      if (this.pendingTimer === null) return;
      const view = this.doc.defaultView || window;
      view.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    schedulePendingFlush(delay: number): void {
      if (this.pendingTimer !== null || this.paused) return;
      const view = this.doc.defaultView || window;
      this.pendingTimer = view.setTimeout(
        () => {
          this.pendingTimer = null;
          this.flushPendingDanmaku();
        },
        Math.max(16, Math.ceil(delay / this.playbackRate)),
      );
    }

    flushPendingDanmaku(): void {
      if (
        !this.dependencies.isVisible() ||
        this.paused ||
        !this.overlay ||
        !this.overlay.isConnected ||
        this.pendingDanmaku.length === 0
      )
        return;

      this.clearPendingTimer();
      let now = this.updateClock();
      for (const item of this.overlay.querySelectorAll<DanmakuItemElement>(
        ".yt-danmaku-item",
      )) {
        if (Number.isFinite(item.danmakuEndTime) && item.danmakuEndTime! <= now)
          item.remove();
      }

      this.discardExpiredDanmaku(now);
      const blockedTypes = new Set<DanmakuType>();
      let nextLaneTime = Infinity;

      while (
        this.pendingDanmaku.length > 0 &&
        this.overlay.childElementCount < MAX_VISIBLE_DANMAKU
      ) {
        let rendered = false;
        for (let index = 0; index < this.pendingDanmaku.length; index++) {
          const entry = this.pendingDanmaku[index];
          const type: DanmakuType =
            entry.data.type === "top" || entry.data.type === "bottom"
              ? entry.data.type
              : "right";
          if (blockedTypes.has(type)) continue;

          this.recalcLanes();
          const lanes = this.laneAvailableTime[type];
          const freeLane = lanes.findIndex((availableAt) => availableAt <= now);
          if (freeLane < 0) {
            blockedTypes.add(type);
            nextLaneTime = Math.min(nextLaneTime, ...lanes);
            continue;
          }

          this.pendingDanmaku.splice(index, 1);
          this.render(entry.data, { elapsed: 0, restore: true });
          now = this.updateClock();
          this.discardExpiredDanmaku(now);
          rendered = true;
          break;
        }
        if (!rendered) break;
      }

      if (this.pendingDanmaku.length === 0) return;
      if (this.overlay.childElementCount >= MAX_VISIBLE_DANMAKU) {
        const endTimes = Array.from(
          this.overlay.querySelectorAll<DanmakuItemElement>(".yt-danmaku-item"),
          (item) => item.danmakuEndTime,
        ).filter(
          (endTime): endTime is number =>
            typeof endTime === "number" &&
            Number.isFinite(endTime) &&
            endTime > now,
        );
        const nextPendingExpiry =
          this.pendingDanmaku[0].queuedAt + MAX_PENDING_DANMAKU_DELAY_MS;
        this.schedulePendingFlush(
          Math.min(...endTimes, nextPendingExpiry) - now,
        );
        return;
      }
      const nextPendingExpiry =
        this.pendingDanmaku[0].queuedAt + MAX_PENDING_DANMAKU_DELAY_MS;
      const nextFlushTime = Math.min(nextLaneTime, nextPendingExpiry);
      if (Number.isFinite(nextFlushTime) && nextFlushTime > now) {
        this.schedulePendingFlush(nextFlushTime - now);
      }
    }

    render(data: DanmakuData, options: DanmakuEmitOptions = {}): void {
      if (
        !this.dependencies.isVisible() ||
        !this.overlay ||
        !this.overlay.isConnected
      )
        return;

      const now = this.updateClock();
      for (const item of this.overlay.querySelectorAll<DanmakuItemElement>(
        ".yt-danmaku-item",
      )) {
        if (Number.isFinite(item.danmakuEndTime) && item.danmakuEndTime! <= now)
          item.remove();
      }
      if (this.overlay.childElementCount >= MAX_VISIBLE_DANMAKU) return;

      const elapsed =
        typeof options.elapsed === "number" && Number.isFinite(options.elapsed)
          ? Math.max(0, options.elapsed)
          : 0;
      const restoring = options.restore === true;
      const advanced = data.advanced;
      this.recalcLanes();
      const danmakuType = normalizeDanmakuType(data);
      const isAdvanced = Boolean(advanced);
      const isFixed = isAdvanced || danmakuType !== "right";
      const lanes = this.laneAvailableTime[danmakuType];
      const numLanes = lanes.length;
      if (!isAdvanced && numLanes === 0) return;

      const overlayWidth =
        this.overlay.clientWidth || (this.isPip ? 640 : 1280);

      const charWidth = this.fontSize * 0.75;
      const messageLength = data.parts
        ? data.parts.reduce(
            (length, part) =>
              length + (part.type === "image" ? 1 : part.text.length),
            0,
          )
        : data.text?.length || 0;
      const textLen =
        (data.amount ? data.amount.length + 3 : 0) + messageLength;
      const fallbackWidth = Math.max(
        50,
        textLen * charWidth + (data.isSuperChat ? 30 : 10),
      );

      const item: DanmakuItemElement = this.doc.createElement("span");
      item.className = "yt-danmaku-item";
      if (isFixed && !isAdvanced) item.classList.add("is-fixed");
      if (isAdvanced) item.classList.add("is-advanced");
      item.classList.add(`is-${danmakuType}`);
      if (/^#[\da-f]{6}$/i.test(data.color || "")) {
        item.dataset.danmakuColor = data.color!;
        if (!data.isSuperChat) item.style.color = data.color!;
      }
      if (data.isSuperChat) {
        item.classList.add("is-superchat");
        if (data.bgColor) item.style.setProperty("--sc-bg", data.bgColor);
        if (data.amount) {
          const amountSpan = this.doc.createElement("span");
          amountSpan.className = "sc-amount";
          amountSpan.textContent = data.amount;
          item.appendChild(amountSpan);
        }
      }

      let animatedContent: HTMLElement | null = null;
      if (isAdvanced) {
        animatedContent = this.doc.createElement("span");
        animatedContent.className = "yt-danmaku-advanced-content";
        item.appendChild(animatedContent);
      }
      const content = animatedContent || item;
      const parts = data.parts || [{ type: "text", text: data.text || "" }];
      for (const part of parts) {
        if (part.type !== "image") {
          content.appendChild(this.doc.createTextNode(part.text));
          continue;
        }

        const image = this.doc.createElement("img");
        image.className = "yt-danmaku-emoji";
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.draggable = false;
        image.src = part.src;
        image.addEventListener(
          "error",
          () => {
            if (part.alt) image.replaceWith(this.doc.createTextNode(part.alt));
            else image.remove();
          },
          { once: true },
        );
        content.appendChild(image);
      }

      if (!isAdvanced || !advanced) item.style.fontSize = `${this.fontSize}px`;
      item.style.fontFamily =
        globalThis.PipCompanion.danmakuSettings.FONT_FAMILIES[
          this.dependencies.getStyle().fontFamily
        ];
      item.style.fontWeight = String(this.dependencies.getStyle().fontWeight);
      item.style.opacity = String(this.dependencies.getStyle().opacity / 100);

      let estimatedWidth = fallbackWidth;
      if (!isAdvanced) {
        item.style.animation = "none";
        item.style.visibility = "hidden";
        this.overlay.appendChild(item);
        const measuredWidth = item.getBoundingClientRect().width;
        estimatedWidth = Math.max(
          50,
          measuredWidth > 0 ? measuredWidth : fallbackWidth,
        );
        item.remove();
        item.style.animation = "";
        item.style.visibility = "";
      }

      const gap = this.isPip ? 20 : 35;
      const scrollDistance = overlayWidth + estimatedWidth + 10;
      const speed = overlayWidth / (this.duration * 1000);
      const totalLifetime = advanced
        ? advanced.durationMs / (this.dependencies.getStyle().speedScale / 100)
        : isFixed
          ? 4000
          : scrollDistance / speed;
      const clearTailDuration = isFixed
        ? totalLifetime
        : (estimatedWidth + gap) / speed;
      if (elapsed * 1000 >= totalLifetime) return;

      let selectedLane = 0;
      let animationDelay = 0;
      let scheduledStartTime = now;
      if (!isAdvanced) {
        let restoredRight: number | null = null;
        const occupancy = restoring
          ? this.restoreOccupancy?.[danmakuType]
          : null;
        if (occupancy) {
          const left = isFixed
            ? (overlayWidth - estimatedWidth) / 2
            : overlayWidth - speed * elapsed * 1000;
          const right = left + estimatedWidth;
          if (!isFixed && (right <= 0 || left >= overlayWidth)) return;
          restoredRight = right;
          selectedLane = occupancy.findIndex((lane) =>
            lane.every(
              (occupied) =>
                right + gap <= occupied.left || left >= occupied.right + gap,
            ),
          );
          if (selectedLane < 0) return;
          occupancy[selectedLane].push({ left, right });
        } else {
          let bestLane = 0;
          let minTime = lanes[0];
          const freeLanes: number[] = [];

          for (let i = 0; i < numLanes; i++) {
            if (lanes[i] <= now) freeLanes.push(i);
            if (lanes[i] < minTime) {
              minTime = lanes[i];
              bestLane = i;
            }
          }

          if (restoring && freeLanes.length === 0) return;
          selectedLane =
            freeLanes.length > 0
              ? freeLanes[Math.floor(Math.random() * freeLanes.length)]
              : bestLane;
        }

        const laneStartTime = restoring
          ? now
          : Math.max(now, lanes[selectedLane]);
        const remainingLaneTime = occupancy
          ? isFixed
            ? Math.max(0, totalLifetime - elapsed * 1000)
            : Math.max(0, ((restoredRight ?? 0) + gap - overlayWidth) / speed)
          : Math.max(0, clearTailDuration - elapsed * 1000);
        scheduledStartTime = laneStartTime;
        animationDelay = Math.max(0, laneStartTime - now) / this.playbackRate;
        if (
          animationDelay >
          Math.min(totalLifetime, MAX_PENDING_DANMAKU_DELAY_MS) /
            this.playbackRate
        )
          return;
        lanes[selectedLane] = Math.max(
          lanes[selectedLane],
          laneStartTime + remainingLaneTime,
        );
      }

      if (!isAdvanced || !advanced) {
        const top = this.topPadding + selectedLane * this.laneHeight;
        if (data.type === "bottom")
          item.style.bottom = `${this.topPadding + selectedLane * this.laneHeight}px`;
        else item.style.top = `${top}px`;
      }

      item.style.setProperty("--dm-start-x", `${overlayWidth}px`);
      item.style.animationDuration = `${totalLifetime / 1000}s`;
      item.style.animationDelay = `${restoring ? 0 : animationDelay / 1000}s`;

      item.danmakuEndTime =
        scheduledStartTime + Math.max(0, totalLifetime - elapsed * 1000);
      this.overlay.appendChild(item);
      let animations: Animation[];
      if (isAdvanced && advanced) {
        animations = this.createAdvancedAnimations(
          item,
          animatedContent,
          advanced,
          overlayWidth,
          totalLifetime,
        );
      } else if (isFixed) {
        const opacity = this.dependencies.getStyle().opacity / 100;
        item.danmakuOpacityAnimation = item.animate(
          [{ opacity }, { opacity }],
          {
            duration: totalLifetime,
            fill: "both",
          },
        );
        animations = [item.danmakuOpacityAnimation];
      } else animations = item.getAnimations();
      for (const animation of animations) {
        animation.playbackRate = this.playbackRate;
        if (elapsed > 0) animation.currentTime = elapsed * 1000;
        if (this.paused) animation.pause();
      }
      animations[0]?.addEventListener(
        "finish",
        () => {
          item.remove();
          this.flushPendingDanmaku();
        },
        { once: true },
      );
    }

    private createAdvancedAnimations(
      item: DanmakuItemElement,
      content: HTMLElement | null,
      advanced: BilibiliAdvancedDanmaku,
      overlayWidth: number,
      totalLifetime: number,
    ): Animation[] {
      const sourceWidth = advanced.sourceWidth || 672;
      const sourceHeight = advanced.sourceHeight || 438;
      const fromLeft = (advanced.fromX / sourceWidth) * 100;
      const fromTop = (advanced.fromY / sourceHeight) * 100;
      const toLeft = (advanced.toX / sourceWidth) * 100;
      const toTop = (advanced.toY / sourceHeight) * 100;
      item.style.left = `${fromLeft}%`;
      item.style.top = `${fromTop}%`;
      item.style.transform = `rotateZ(${advanced.rotateZ}deg) rotateY(${advanced.rotateY}deg)`;
      item.dataset.sourceWidth = String(sourceWidth);
      item.dataset.sourceFontSize = String(advanced.fontSize);
      item.style.fontSize = `${this.capFontSize(advanced.fontSize * (overlayWidth / sourceWidth) * (this.dependencies.getStyle().fontSizeScale / 100), this.isPip ? MIN_PIP_DANMAKU_FONT_SIZE : 0)}px`;

      const animations = [
        item.animate(
          [
            { left: `${fromLeft}%`, top: `${fromTop}%` },
            { left: `${toLeft}%`, top: `${toTop}%` },
          ],
          { duration: totalLifetime, fill: "both", easing: "linear" },
        ),
      ];
      if (content) {
        if (advanced.alphaStart === advanced.alphaEnd)
          content.style.opacity = String(advanced.alphaStart);
        else {
          animations.push(
            content.animate(
              [
                { opacity: advanced.alphaStart },
                { opacity: advanced.alphaEnd },
              ],
              { duration: totalLifetime, fill: "both", easing: "linear" },
            ),
          );
        }
      }
      return animations;
    }

    destroy(): void {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.clearPendingTimer();
      this.pendingDanmaku.length = 0;
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      this.laneAvailableTime = { right: [], top: [], bottom: [] };
    }
  }

  globalThis.PipCompanion.ContentDanmakuRenderer = {
    create: (
      container: Element,
      dependencies: ContentDanmakuRendererDependencies,
      options?: DanmakuRendererOptions,
    ) => new DanmakuRenderer(container, dependencies, options),
  };
})();
