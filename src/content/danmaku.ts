"use strict";

interface DanmakuPartText {
  type: "text";
  text: string;
}

interface DanmakuPartImage {
  type: "image";
  src: string;
  alt: string;
}

type DanmakuPart = DanmakuPartText | DanmakuPartImage;

type DanmakuType = "right" | "top" | "bottom";

interface DanmakuData {
  type?: DanmakuType | string;
  text?: string;
  parts?: DanmakuPart[];
  color?: string;
  isSuperChat?: boolean;
  bgColor?: string;
  amount?: string;
  author?: string;
  messageId?: string;
  id?: string;
  replayTime?: number | null;
}

interface DanmakuItemElement extends HTMLSpanElement {
  danmakuEndTime?: number;
}

interface DanmakuPendingItem {
  data: DanmakuData;
  queuedAt: number;
}

interface LaneOccupancy {
  left: number;
  right: number;
}

interface ReplayMessageEntry {
  data: DanmakuData;
  replayTime: number;
  emitted: boolean;
}

interface BilibiliVideoIdentity {
  bvid: string;
  avid: string;
  page: number;
  key: string;
}

interface BilibiliDanmakuMessage extends DanmakuData {
  id?: string;
  replayTime: number;
  type: DanmakuType;
  color?: string;
  text?: string;
}

interface BilibiliDanmakuResponse {
  ok: boolean;
  messages?: BilibiliDanmakuMessage[];
  duration?: number;
  segmentCount?: number;
  segmentStart: number;
  segmentEnd: number;
  recoveredSegments?: { segment: number; status: number; comments: number }[];
  unavailableSegments?: { segment: number; status: number }[];
  fallbackError?: string;
  legacyFallback?: boolean;
  error?: string;
}

interface DanmakuRendererOptions {
  isPip?: boolean;
}

interface DanmakuEmitOptions {
  restore?: boolean;
  elapsed?: number;
}

const DANMAKU_STORAGE_KEY = "danmakuEnabled";
const DANMAKU_IS_YOUTUBE = /(^|\.)youtube\.com$/.test(location.hostname);
const DANMAKU_IS_BILIBILI = /(^|\.)bilibili\.com$/.test(location.hostname);
const DANMAKU_IS_BILIBILI_LIVE = location.hostname === "live.bilibili.com";
const DANMAKU_IS_TWITCH = /(^|\.)twitch\.tv$/.test(location.hostname);
const DANMAKU_IS_BAHAMUT = location.hostname === "ani.gamer.com.tw";
const DANMAKU_IS_SUPPORTED_SITE =
  DANMAKU_IS_YOUTUBE ||
  DANMAKU_IS_BILIBILI ||
  DANMAKU_IS_TWITCH ||
  DANMAKU_IS_BAHAMUT;
const MAX_REPLAY_MESSAGES = 2000;
const REPLAY_LATE_TOLERANCE_SECONDS = 3;
const REPLAY_RESTORE_WINDOW_SECONDS = 5;
const MAX_VISIBLE_DANMAKU = 100;
const MAX_PENDING_DANMAKU = 300;
const MAX_PENDING_DANMAKU_DELAY_MS = 250;

let danmakuEnabled = false;
let danmakuSettingsLoaded = false;
let danmakuPlaybackRate = 1;
let danmakuPaused = false;
let mainDanmakuRenderer: DanmakuRenderer | null = null;
let pipDanmakuRenderer: DanmakuRenderer | null = null;
let backgroundChatFrame: HTMLIFrameElement | null = null;
let chatObserver: MutationObserver | null = null;
let chatDocumentObserver: MutationObserver | null = null;
let siteDanmakuObserver: MutationObserver | null = null;
let siteDanmakuRoot: Element | null = null;
const processedSiteDanmaku = new WeakMap<Element, string>();
let observedChatDocument: Document | null = null;
let observedChatFrame: HTMLIFrameElement | null = null;
let observedItemsNode: Element | null = null;
let replayVideo: HTMLVideoElement | null = null;
let replayVideoController: AbortController | null = null;
let replaySeeking = false;
let replayVideoId = "";
let bilibiliPipVideo: HTMLVideoElement | null = null;
let bilibiliPipSourceVideo: HTMLVideoElement | null = null;
let bilibiliVideoController: AbortController | null = null;
let bilibiliPageKey = "";
let bilibiliMessages: BilibiliDanmakuMessage[] = [];
let bilibiliMessageIndex = 0;
let bilibiliMessagesLoaded = false;
let bilibiliSeekedBeforeLoad = false;
let bilibiliRequestGeneration = 0;
const bilibiliLoadedSegments = new Set<number>();
const bilibiliLoadingSegments = new Set<number>();
const bilibiliUnavailableSegments = new Set<number>();
const bilibiliSegmentRetryAt = new Map<number, number>();
let bilibiliSegmentCount = 0;
let bilibiliPendingRestore = false;
let bilibiliLegacyFallback = false;
let bilibiliEmittedMessages = new WeakSet<BilibiliDanmakuMessage>();
const replayMessages = new Map<string | symbol, ReplayMessageEntry>();

if (DANMAKU_IS_SUPPORTED_SITE) {
  try {
    chrome.storage.local.get(DANMAKU_STORAGE_KEY, (result) => {
      const storedValue = result?.[DANMAKU_STORAGE_KEY];
      danmakuEnabled = storedValue === undefined ? true : Boolean(storedValue);
      danmakuSettingsLoaded = true;
      updateAllDanmakuVisibility();
    });
  } catch {
    danmakuEnabled = true;
    danmakuSettingsLoaded = true;
    updateAllDanmakuVisibility();
  }

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[DANMAKU_STORAGE_KEY]) {
        const change = changes[DANMAKU_STORAGE_KEY];
        const val =
          change && typeof change === "object" && "newValue" in change
            ? change.newValue
            : change;
        danmakuEnabled = Boolean(val);
        danmakuSettingsLoaded = true;
        updateAllDanmakuVisibility();
      }
    });
  }
}

function updateAllDanmakuVisibility(): void {
  mainDanmakuRenderer?.updateVisibility();
  pipDanmakuRenderer?.updateVisibility();

  if (DANMAKU_IS_YOUTUBE) checkAndBindDanmakuChat();
  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE)
    checkAndBindBilibiliDanmaku(bilibiliPipSourceVideo);
  if (DANMAKU_IS_TWITCH || DANMAKU_IS_BAHAMUT || DANMAKU_IS_BILIBILI_LIVE)
    checkAndBindSiteDanmaku();
}

function toggleDanmaku(forceState?: boolean): boolean {
  if (!DANMAKU_IS_SUPPORTED_SITE) return false;
  danmakuEnabled =
    typeof forceState === "boolean" ? forceState : !danmakuEnabled;
  try {
    chrome.storage.local.set({ [DANMAKU_STORAGE_KEY]: danmakuEnabled });
  } catch {}
  updateAllDanmakuVisibility();
  return danmakuEnabled;
}

function isDanmakuEnabled(): boolean {
  return danmakuEnabled;
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
      font-weight: 700;
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

class DanmakuRenderer {
  container: Element;
  isPip: boolean;
  doc: Document;
  laneAvailableTime: Record<DanmakuType, number[]>;
  overlay: HTMLElement | null = null;
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

  constructor(container: Element, options: DanmakuRendererOptions = {}) {
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

  updateVisibility(): void {
    if (!this.overlay) return;
    this.overlay.hidden = !danmakuEnabled;
    if (!danmakuEnabled) {
      this.clearPendingTimer();
      this.pendingDanmaku.length = 0;
    } else {
      this.flushPendingDanmaku();
    }
  }

  updateClock(): number {
    const now = performance.now();
    if (!this.paused) {
      this.clockTime += (now - this.lastClockUpdate) * this.playbackRate;
    }
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
    for (const item of this.overlay.querySelectorAll<DanmakuItemElement>(
      ".yt-danmaku-item",
    )) {
      for (const animation of item.getAnimations()) {
        if (paused) animation.pause();
        else animation.play();
      }
    }
  }

  setPlaybackRate(rate: number): void {
    this.updateClock();
    this.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    for (const item of this.overlay?.querySelectorAll<DanmakuItemElement>(
      ".yt-danmaku-item",
    ) || []) {
      for (const animation of item.getAnimations()) {
        animation.playbackRate = this.playbackRate;
      }
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
    const usableHeight = height * 0.72 - this.topPadding;
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
    if (!danmakuEnabled || !this.overlay || !this.overlay.isConnected) return;

    if (options.restore === true) {
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
        entry.data.type === "top" || entry.data.type === "bottom"
          ? 4000
          : this.duration * 1000;
      return (
        now - entry.queuedAt < Math.min(lifetime, MAX_PENDING_DANMAKU_DELAY_MS)
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
      !danmakuEnabled ||
      this.paused ||
      !this.overlay ||
      !this.overlay.isConnected ||
      this.pendingDanmaku.length === 0
    ) {
      return;
    }

    this.clearPendingTimer();
    let now = this.updateClock();
    for (const item of this.overlay.querySelectorAll<DanmakuItemElement>(
      ".yt-danmaku-item",
    )) {
      if (Number.isFinite(item.danmakuEndTime) && item.danmakuEndTime! <= now) {
        item.remove();
      }
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
      this.schedulePendingFlush(Math.min(...endTimes, nextPendingExpiry) - now);
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
      !danmakuEnabled ||
      !this.overlay ||
      !this.overlay.isConnected ||
      this.overlay.childElementCount >= MAX_VISIBLE_DANMAKU
    ) {
      return;
    }

    const elapsed =
      typeof options.elapsed === "number" && Number.isFinite(options.elapsed)
        ? Math.max(0, options.elapsed)
        : 0;
    const restoring = options.restore === true;
    this.recalcLanes();
    const isFixed = data.type === "top" || data.type === "bottom";
    const danmakuType: DanmakuType = isFixed
      ? (data.type as "top" | "bottom")
      : "right";
    const lanes = this.laneAvailableTime[danmakuType];
    const numLanes = lanes.length;
    if (numLanes === 0) return;

    const now = this.updateClock();
    const overlayWidth = this.overlay.clientWidth || (this.isPip ? 640 : 1280);

    const charWidth = this.fontSize * 0.75;
    const messageLength = data.parts
      ? data.parts.reduce(
          (length, part) =>
            length + (part.type === "image" ? 1 : part.text.length),
          0,
        )
      : data.text?.length || 0;
    const textLen = (data.amount ? data.amount.length + 3 : 0) + messageLength;
    const estimatedWidth = Math.max(
      50,
      textLen * charWidth + (data.isSuperChat ? 30 : 10),
    );

    const gap = this.isPip ? 20 : 35;
    const scrollDistance = overlayWidth + estimatedWidth + 10;
    const speed = scrollDistance / (this.duration * 1000);
    const totalLifetime = isFixed ? 4000 : this.duration * 1000;
    const clearTailDuration = isFixed ? 4000 : (estimatedWidth + gap) / speed;
    if (elapsed * 1000 >= totalLifetime) return;

    let selectedLane: number;
    let restoredRight: number | null = null;
    const occupancy = restoring ? this.restoreOccupancy?.[danmakuType] : null;
    if (occupancy) {
      const left = isFixed
        ? (overlayWidth - estimatedWidth) / 2
        : overlayWidth - (scrollDistance * elapsed) / this.duration;
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
      if (freeLanes.length > 0) {
        selectedLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
      } else {
        selectedLane = bestLane;
      }
    }

    const laneStartTime = restoring ? now : Math.max(now, lanes[selectedLane]);
    const remainingLaneTime = occupancy
      ? isFixed
        ? Math.max(0, totalLifetime - elapsed * 1000)
        : Math.max(0, ((restoredRight ?? 0) + gap - overlayWidth) / speed)
      : Math.max(0, clearTailDuration - elapsed * 1000);
    const animationDelay = Math.max(0, laneStartTime - now) / this.playbackRate;
    if (animationDelay > totalLifetime / this.playbackRate) return;
    lanes[selectedLane] = Math.max(
      lanes[selectedLane],
      laneStartTime + remainingLaneTime,
    );

    const item: DanmakuItemElement = this.doc.createElement("span");
    item.className = "yt-danmaku-item";
    if (isFixed) item.classList.add("is-fixed");
    if (/^#[\da-f]{6}$/i.test(data.color || "")) item.style.color = data.color!;
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

    const parts = data.parts || [{ type: "text", text: data.text || "" }];
    for (const part of parts) {
      if (part.type !== "image") {
        item.appendChild(this.doc.createTextNode(part.text));
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
      item.appendChild(image);
    }

    const top = this.topPadding + selectedLane * this.laneHeight;
    if (data.type === "bottom") {
      item.style.bottom = `${this.topPadding + selectedLane * this.laneHeight}px`;
    } else {
      item.style.top = `${top}px`;
    }
    item.style.fontSize = `${this.fontSize}px`;
    item.style.setProperty("--dm-start-x", `${overlayWidth}px`);
    item.style.animationDuration = `${this.duration}s`;
    item.style.animationDelay = `${restoring ? 0 : animationDelay / 1000}s`;

    item.danmakuEndTime = now + Math.max(0, totalLifetime - elapsed * 1000);
    this.overlay.appendChild(item);
    const animations = isFixed
      ? [
          item.animate([{ opacity: 1 }, { opacity: 1 }], {
            duration: totalLifetime,
            fill: "both",
          }),
        ]
      : item.getAnimations();
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

  destroy(): void {
    this.clearPendingTimer();
    this.pendingDanmaku.length = 0;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.laneAvailableTime = { right: [], top: [], bottom: [] };
  }
}

function getSuperChatColor(node: HTMLElement): string {
  const primary =
    node.style.getPropertyValue("--yt-live-chat-paid-message-primary-color") ||
    node.style.getPropertyValue(
      "--yt-live-chat-paid-message-header-background-color",
    ) ||
    node.style.getPropertyValue("--yt-live-chat-paid-message-background-color");
  if (primary && primary.trim()) return primary.trim();

  const header = node.querySelector("#header") || node.querySelector("#card");
  if (header) {
    const bg = window.getComputedStyle(header).backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
  }
  const nodeBg = window.getComputedStyle(node).backgroundColor;
  if (nodeBg && nodeBg !== "transparent" && nodeBg !== "rgba(0, 0, 0, 0)")
    return nodeBg;

  return "#0f9d58";
}

function parseReplayTimestamp(value?: string | null): number | null {
  const timestamp = value?.trim();
  if (!timestamp || !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(timestamp)) return null;

  const parts = timestamp.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  const lastPart = parts.at(-1);
  if (lastPart === undefined || lastPart >= 60) return null;
  if (parts.length === 3 && parts[1] >= 60) return null;

  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

function appendMessageText(parts: DanmakuPart[], text: string): void {
  if (!text) return;
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") lastPart.text += text;
  else parts.push({ type: "text", text });
}

function extractMessageContent(messageEl: Element): {
  parts: DanmakuPart[];
  text: string;
} {
  const parts: DanmakuPart[] = [];
  let text = "";

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || "";
      appendMessageText(parts, value);
      text += value;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    if (el.tagName.toLowerCase() === "img") {
      const alt = el.getAttribute("alt") || el.getAttribute("aria-label") || "";
      let src = "";
      try {
        const source =
          (el as HTMLImageElement).currentSrc || el.getAttribute("src");
        if (source) {
          const imageUrl = new URL(source, location.href);
          if (imageUrl.protocol === "https:") src = imageUrl.href;
        }
      } catch {}

      if (src) parts.push({ type: "image", src, alt });
      else appendMessageText(parts, alt);
      text += alt;
      return;
    }

    el.childNodes.forEach(visit);
  };

  messageEl.childNodes.forEach(visit);
  return { parts, text: text.trim() };
}

function extractMessageFromNode(node: Node | null): DanmakuData | null {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  const isPaid =
    el.tagName.toLowerCase() === "yt-live-chat-paid-message-renderer" ||
    Boolean(el.closest("yt-live-chat-paid-message-renderer"));
  const isText =
    el.tagName.toLowerCase() === "yt-live-chat-text-message-renderer" ||
    Boolean(el.closest("yt-live-chat-text-message-renderer"));

  if (!isPaid && !isText) return null;

  const targetNode = (
    isPaid
      ? el.tagName.toLowerCase() === "yt-live-chat-paid-message-renderer"
        ? el
        : el.closest<HTMLElement>("yt-live-chat-paid-message-renderer")
      : el.tagName.toLowerCase() === "yt-live-chat-text-message-renderer"
        ? el
        : el.closest<HTMLElement>("yt-live-chat-text-message-renderer")
  ) as (HTMLElement & { data?: { id?: string } }) | null;

  if (!targetNode) return null;

  if (targetNode.dataset.ytDanmakuDone) return null;

  const messageEl =
    targetNode.querySelector("#message") ||
    targetNode.querySelector("#content");
  const { parts, text } = messageEl
    ? extractMessageContent(messageEl)
    : { parts: [], text: "" };
  const messageId = targetNode.id || targetNode.data?.id || "";
  const replayTime = parseReplayTimestamp(
    targetNode.querySelector("#timestamp")?.textContent,
  );

  const authorEl = targetNode.querySelector<HTMLElement>("#author-name");
  const author = authorEl
    ? (authorEl.innerText || authorEl.textContent || "").trim()
    : "";

  if (isPaid) {
    const amountEl = targetNode.querySelector<HTMLElement>("#purchase-amount");
    const amount = amountEl
      ? (amountEl.innerText || amountEl.textContent || "").trim()
      : "";
    const bgColor = getSuperChatColor(targetNode);

    let displayText = text;
    let displayParts = parts;
    if (!displayText && author) {
      displayText = author;
      displayParts = [{ type: "text", text: author }];
    }
    if (!displayText && !amount) return null;
    targetNode.dataset.ytDanmakuDone = "true";

    return {
      isSuperChat: true,
      amount,
      author,
      text: displayText,
      parts: displayParts,
      messageId,
      replayTime,
      bgColor,
    };
  }

  if (!text) return null;
  targetNode.dataset.ytDanmakuDone = "true";

  return {
    isSuperChat: false,
    author,
    text,
    parts,
    messageId,
    replayTime,
  };
}

function getMainPlayer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#movie_player");
}

function ensureMainRenderer(): DanmakuRenderer | null {
  const player = getMainPlayer();
  if (!player) return null;
  if (
    !mainDanmakuRenderer ||
    mainDanmakuRenderer.container !== player ||
    !mainDanmakuRenderer.overlay?.isConnected
  ) {
    mainDanmakuRenderer?.destroy();
    mainDanmakuRenderer = new DanmakuRenderer(player, { isPip: false });
    mainDanmakuRenderer.setPlaybackRate(danmakuPlaybackRate);
    mainDanmakuRenderer.setPaused(danmakuPaused);
  }
  return mainDanmakuRenderer;
}

function initDanmakuInPip(
  win: Window | null,
  video: HTMLVideoElement | null,
): void {
  if (!DANMAKU_IS_SUPPORTED_SITE || !win || win.closed) return;
  const screen =
    win.document.querySelector<HTMLElement>(".screen") || win.document.body;
  if (!screen) return;
  pipDanmakuRenderer?.destroy();
  pipDanmakuRenderer = new DanmakuRenderer(screen, { isPip: true });
  pipDanmakuRenderer.updateVisibility();
  pipDanmakuRenderer.setPlaybackRate(
    video?.playbackRate ?? danmakuPlaybackRate,
  );
  pipDanmakuRenderer.setPaused(video?.paused ?? danmakuPaused);
  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE) {
    bilibiliPipSourceVideo = video;
    checkAndBindBilibiliDanmaku(video);
  }
  if (DANMAKU_IS_TWITCH || DANMAKU_IS_BAHAMUT || DANMAKU_IS_BILIBILI_LIVE)
    checkAndBindSiteDanmaku();
}

function resetBilibiliState(): void {
  bilibiliMessages = [];
  bilibiliMessageIndex = 0;
  bilibiliMessagesLoaded = false;
  bilibiliSeekedBeforeLoad = false;
  bilibiliRequestGeneration++;
  bilibiliLoadedSegments.clear();
  bilibiliLoadingSegments.clear();
  bilibiliUnavailableSegments.clear();
  bilibiliSegmentRetryAt.clear();
  bilibiliSegmentCount = 0;
  bilibiliPendingRestore = false;
  bilibiliLegacyFallback = false;
  bilibiliEmittedMessages = new WeakSet();
}

function destroyDanmakuInPip(): void {
  bilibiliVideoController?.abort();
  bilibiliVideoController = null;
  bilibiliPipVideo = null;
  bilibiliPipSourceVideo = null;
  bilibiliPageKey = "";
  resetBilibiliState();
  pipDanmakuRenderer?.destroy();
  pipDanmakuRenderer = null;
}

function setDanmakuPaused(paused: boolean): void {
  danmakuPaused = paused;
  mainDanmakuRenderer?.setPaused(paused);
  pipDanmakuRenderer?.setPaused(paused);
}

function setDanmakuPlaybackRate(rate: number): void {
  danmakuPlaybackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  mainDanmakuRenderer?.setPlaybackRate(danmakuPlaybackRate);
  pipDanmakuRenderer?.setPlaybackRate(danmakuPlaybackRate);
}

function broadcastDanmaku(
  data?: DanmakuData | null,
  options: DanmakuEmitOptions = {},
): void {
  if (!data || !danmakuEnabled) return;
  ensureMainRenderer();
  mainDanmakuRenderer?.emit(data, options);
  pipDanmakuRenderer?.emit(data, options);
}

function clearDanmaku(): void {
  mainDanmakuRenderer?.clear();
  pipDanmakuRenderer?.clear();
}

function getBilibiliVideoIdentity(): BilibiliVideoIdentity | null {
  const match = location.pathname.match(/^\/video\/(BV[\w]{10}|av\d+)/i);
  const page = Number(new URL(location.href).searchParams.get("p") || 1);
  if (!match || !Number.isInteger(page) || page < 1 || page > 1000) return null;
  const videoId = match[1];
  return {
    bvid: /^BV/i.test(videoId) ? videoId : "",
    avid: /^av/i.test(videoId) ? videoId.slice(2) : "",
    page,
    key: `${videoId}:${page}`,
  };
}

function findBilibiliMessageIndex(time: number): number {
  let low = 0;
  let high = bilibiliMessages.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (bilibiliMessages[mid].replayTime < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

function resetBilibiliPlaybackCursor(time: number): number {
  bilibiliMessageIndex = findBilibiliMessageIndex(time);
  bilibiliEmittedMessages = new WeakSet();
  for (let index = 0; index < bilibiliMessageIndex; index++) {
    bilibiliEmittedMessages.add(bilibiliMessages[index]);
  }
  return bilibiliMessageIndex;
}

function restoreRecentBilibiliDanmaku(video: HTMLVideoElement): void {
  if (!pipDanmakuRenderer || !bilibiliMessagesLoaded) return;
  const currentTime = video.currentTime;
  if (!Number.isFinite(currentTime)) return;
  pipDanmakuRenderer.clear();
  const restoreWindow = Math.max(
    REPLAY_RESTORE_WINDOW_SECONDS,
    pipDanmakuRenderer.duration,
  );
  const start = findBilibiliMessageIndex(
    Math.max(0, currentTime - restoreWindow),
  );
  const end = resetBilibiliPlaybackCursor(currentTime);
  const recentMessages = bilibiliMessages
    .slice(start, end)
    .filter((message) => {
      const elapsed = currentTime - message.replayTime;
      const lifetime =
        message.type === "top" || message.type === "bottom"
          ? 4
          : pipDanmakuRenderer!.duration;
      return elapsed < lifetime;
    })
    .slice(-MAX_VISIBLE_DANMAKU);
  pipDanmakuRenderer.beginSeekRestore();
  try {
    for (const message of recentMessages) {
      pipDanmakuRenderer.emit(message, {
        elapsed: currentTime - message.replayTime,
        restore: true,
      });
    }
  } finally {
    pipDanmakuRenderer.endSeekRestore();
  }
  processBilibiliDanmaku(video);
}

function startBilibiliDanmakuAtCurrentTime(video: HTMLVideoElement): void {
  if (!pipDanmakuRenderer || !bilibiliMessagesLoaded) return;
  const currentTime = video.currentTime;
  if (!Number.isFinite(currentTime)) return;
  pipDanmakuRenderer.clear();
  resetBilibiliPlaybackCursor(currentTime);
  processBilibiliDanmaku(video);
}

function processBilibiliDanmaku(video: HTMLVideoElement): void {
  if (
    !danmakuEnabled ||
    !bilibiliMessagesLoaded ||
    !pipDanmakuRenderer ||
    video.seeking
  ) {
    return;
  }
  const currentTime = video.currentTime;
  if (!Number.isFinite(currentTime)) return;
  while (
    bilibiliMessageIndex < bilibiliMessages.length &&
    bilibiliMessages[bilibiliMessageIndex].replayTime <= currentTime + 0.15
  ) {
    const message = bilibiliMessages[bilibiliMessageIndex++];
    if (bilibiliEmittedMessages.has(message)) continue;
    bilibiliEmittedMessages.add(message);
    const elapsed = Math.max(0, currentTime - message.replayTime);
    if (elapsed > REPLAY_LATE_TOLERANCE_SECONDS) continue;
    const restoring = elapsed > MAX_PENDING_DANMAKU_DELAY_MS / 1000;
    pipDanmakuRenderer.emit(message, {
      elapsed: restoring ? elapsed : 0,
      restore: restoring,
    });
  }
}

function waitForBilibiliRetry(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function sendBilibiliMessage(
  payload: unknown,
): Promise<BilibiliDanmakuResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await chrome.runtime.sendMessage(
        payload,
      )) as BilibiliDanmakuResponse;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await waitForBilibiliRetry(attempt ? 900 : 300);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Bilibili background connection failed");
}

function mergeBilibiliMessages(messages: BilibiliDanmakuMessage[]): void {
  const knownIds = new Set(
    bilibiliMessages
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id && id !== "0")),
  );
  let addedMessages = false;
  for (const message of messages) {
    if (message.id && message.id !== "0") {
      if (knownIds.has(message.id)) continue;
      knownIds.add(message.id);
    }
    bilibiliMessages.push(message);
    addedMessages = true;
  }
  if (!addedMessages) return;
  bilibiliMessages.sort((a, b) => a.replayTime - b.replayTime);
  const currentTime = bilibiliPipVideo?.currentTime;
  if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
    const lateMessageStart = findBilibiliMessageIndex(
      Math.max(0, currentTime - REPLAY_LATE_TOLERANCE_SECONDS),
    );
    bilibiliMessageIndex = Math.min(bilibiliMessageIndex, lateMessageStart);
  }
}

function updateBilibiliSegmentAvailability(
  response: BilibiliDanmakuResponse,
): void {
  if (response.legacyFallback) {
    bilibiliLegacyFallback = true;
    bilibiliLoadedSegments.clear();
    bilibiliUnavailableSegments.clear();
    return;
  }
  const unavailable = new Map(
    (Array.isArray(response.unavailableSegments)
      ? response.unavailableSegments
      : []
    ).map(({ segment, status }) => [segment, status]),
  );
  const retryAt = Date.now() + 5000;
  for (
    let segment = response.segmentStart;
    segment <= response.segmentEnd;
    segment++
  ) {
    const status = unavailable.get(segment);
    if (status === 404 && !response.fallbackError) {
      bilibiliLoadedSegments.delete(segment);
      bilibiliUnavailableSegments.add(segment);
      bilibiliSegmentRetryAt.delete(segment);
    } else if (status) {
      bilibiliLoadedSegments.delete(segment);
      bilibiliUnavailableSegments.delete(segment);
      bilibiliSegmentRetryAt.set(segment, retryAt);
    } else {
      bilibiliLoadedSegments.add(segment);
      bilibiliUnavailableSegments.delete(segment);
      bilibiliSegmentRetryAt.delete(segment);
    }
  }
}

function isBilibiliSegmentCoolingDown(
  segment: number,
  now = Date.now(),
): boolean {
  return (bilibiliSegmentRetryAt.get(segment) || 0) > now;
}

function logBilibiliResponse(response: BilibiliDanmakuResponse): void {
  if (response.legacyFallback) {
    console.warn(
      "[Caption PiP] This long Bilibili video uses the legacy XML danmaku fallback; coverage may be incomplete.",
    );
  }
  if (
    Array.isArray(response.recoveredSegments) &&
    response.recoveredSegments.length
  ) {
    const recovered = response.recoveredSegments
      .map(
        ({ segment, status, comments }) =>
          `#${segment} HTTP ${status} (${comments} comments from XML fallback)`,
      )
      .join(", ");
    console.info(`[Caption PiP] Recovered Bilibili danmaku: ${recovered}.`);
  }
  if (Array.isArray(response.unavailableSegments)) {
    const missing = response.unavailableSegments.filter(
      ({ status }) => status === 404 && !response.fallbackError,
    );
    if (missing.length) {
      const segments = missing.map(({ segment }) => `#${segment}`).join(", ");
      console.info(
        `[Caption PiP] Bilibili danmaku is unavailable for segments ${segments} (HTTP 404); these segments will not be retried during this PiP session.`,
      );
    }
    const otherUnavailable = response.unavailableSegments.filter(
      ({ status }) => status !== 404 || Boolean(response.fallbackError),
    );
    if (otherUnavailable.length) {
      const unavailable = otherUnavailable
        .map(({ segment, status }) => `#${segment} HTTP ${status}`)
        .join(", ");
      console.warn(
        `[Caption PiP] Bilibili danmaku segments still unavailable: ${unavailable}.`,
      );
    }
  }
  if (response.fallbackError) {
    console.warn(
      "[Caption PiP] Legacy Bilibili danmaku fallback failed:",
      response.fallbackError,
    );
  }
}

function requestBilibiliSegments(
  identity: BilibiliVideoIdentity,
  startSegment: number,
  endSegment: number,
  { initial = false }: { initial?: boolean } = {},
): void {
  if (bilibiliLegacyFallback) return;

  const start = Math.max(1, Math.floor(startSegment));
  const end = Math.min(
    bilibiliSegmentCount || endSegment,
    Math.max(start, Math.floor(endSegment)),
  );
  const segments: number[] = [];
  const now = Date.now();
  for (let segment = start; segment <= end; segment++) {
    if (
      !bilibiliLoadedSegments.has(segment) &&
      !bilibiliLoadingSegments.has(segment) &&
      !bilibiliUnavailableSegments.has(segment) &&
      !isBilibiliSegmentCoolingDown(segment, now)
    ) {
      segments.push(segment);
    }
  }

  if (!segments.length) return;

  const requestStart = segments[0];
  let requestEnd = requestStart;
  for (
    let index = 1;
    index < segments.length && segments[index] === requestEnd + 1;
    index++
  ) {
    requestEnd = segments[index];
  }

  for (let segment = requestStart; segment <= requestEnd; segment++) {
    bilibiliLoadingSegments.add(segment);
  }

  const requestGeneration = initial
    ? ++bilibiliRequestGeneration
    : bilibiliRequestGeneration;

  sendBilibiliMessage({
    type: "GET_BILIBILI_DANMAKU",
    ...(identity.bvid ? { bvid: identity.bvid } : { avid: identity.avid }),
    page: identity.page,
    startSegment: requestStart,
    endSegment: requestEnd,
  })
    .then((response) => {
      if (
        requestGeneration !== bilibiliRequestGeneration ||
        identity.key !== bilibiliPageKey ||
        !pipDanmakuRenderer ||
        !bilibiliPipVideo ||
        !danmakuEnabled
      ) {
        return;
      }

      if (!response?.ok || !Array.isArray(response.messages)) {
        throw new Error(response?.error || "Bilibili danmaku request failed");
      }

      bilibiliSegmentCount =
        Number(response.segmentCount) || bilibiliSegmentCount;
      updateBilibiliSegmentAvailability(response);
      if (initial) logBilibiliResponse(response);
      mergeBilibiliMessages(response.messages);
      bilibiliMessagesLoaded = true;

      const playbackVideo = bilibiliPipVideo;
      if (initial) {
        for (let segment = requestStart; segment <= requestEnd; segment++) {
          bilibiliLoadingSegments.delete(segment);
        }
        if (bilibiliSeekedBeforeLoad) {
          bilibiliSeekedBeforeLoad = false;
          restoreRecentBilibiliDanmaku(playbackVideo);
          const currentSegment =
            Math.floor(playbackVideo.currentTime / 120) + 1;
          if (
            bilibiliLegacyFallback ||
            bilibiliLoadedSegments.has(currentSegment)
          ) {
            bilibiliPendingRestore = false;
          }
        } else {
          startBilibiliDanmakuAtCurrentTime(playbackVideo);
        }
      } else {
        if (bilibiliPendingRestore) {
          restoreRecentBilibiliDanmaku(playbackVideo);
          const currentSegment =
            Math.floor(playbackVideo.currentTime / 120) + 1;
          if (
            bilibiliLegacyFallback ||
            bilibiliLoadedSegments.has(currentSegment)
          ) {
            bilibiliPendingRestore = false;
          }
        } else {
          processBilibiliDanmaku(playbackVideo);
        }
      }
    })
    .catch((error) => {
      if (
        requestGeneration !== bilibiliRequestGeneration ||
        identity.key !== bilibiliPageKey
      ) {
        return;
      }

      const retryAt = Date.now() + 5000;
      for (let segment = requestStart; segment <= requestEnd; segment++) {
        bilibiliSegmentRetryAt.set(segment, retryAt);
      }
      console.warn(
        "[Caption PiP] Could not load Bilibili danmaku segment:",
        error,
      );
    })
    .finally(() => {
      if (requestGeneration !== bilibiliRequestGeneration) return;
      for (let segment = requestStart; segment <= requestEnd; segment++) {
        bilibiliLoadingSegments.delete(segment);
      }
    });
}

function ensureBilibiliSegments(video: HTMLVideoElement): void {
  const identity = getBilibiliVideoIdentity();
  if (
    bilibiliLegacyFallback ||
    !identity ||
    !Number.isFinite(video?.currentTime)
  ) {
    return;
  }
  const currentSegment = Math.floor(video.currentTime / 120) + 1;
  const endSegment = Math.min(
    bilibiliSegmentCount || currentSegment + 2,
    currentSegment + 2,
  );
  requestBilibiliSegments(identity, currentSegment, endSegment);
}

function checkAndBindBilibiliDanmaku(video: HTMLVideoElement | null): void {
  if (!DANMAKU_IS_BILIBILI || !pipDanmakuRenderer) return;
  if (video) bilibiliPipSourceVideo = video;

  const targetVideo = bilibiliPipSourceVideo;
  const identity = getBilibiliVideoIdentity();
  if (!danmakuEnabled || !identity || !targetVideo) {
    bilibiliVideoController?.abort();
    bilibiliVideoController = null;
    bilibiliPipVideo = null;
    bilibiliPageKey = "";
    resetBilibiliState();
    pipDanmakuRenderer.clear();
    return;
  }

  if (identity.key !== bilibiliPageKey) {
    bilibiliVideoController?.abort();
    bilibiliVideoController = null;
    bilibiliPipVideo = null;
    bilibiliPageKey = identity.key;
    resetBilibiliState();
    pipDanmakuRenderer.clear();
  }

  if (targetVideo !== bilibiliPipVideo) {
    bilibiliVideoController?.abort();
    const controller = new AbortController();
    bilibiliVideoController = controller;
    bilibiliPipVideo = targetVideo;
    let seeking = false;
    targetVideo.addEventListener(
      "timeupdate",
      () => {
        processBilibiliDanmaku(targetVideo);
        ensureBilibiliSegments(targetVideo);
      },
      {
        signal: controller.signal,
      },
    );

    targetVideo.addEventListener(
      "seeking",
      () => {
        seeking = true;
        pipDanmakuRenderer?.clear();
      },
      { signal: controller.signal },
    );
    targetVideo.addEventListener(
      "seeked",
      () => {
        seeking = false;
        bilibiliSeekedBeforeLoad = true;
        ensureBilibiliSegments(targetVideo);
        const currentSegment = Math.floor(targetVideo.currentTime / 120) + 1;
        if (
          bilibiliLegacyFallback ||
          bilibiliLoadedSegments.has(currentSegment)
        ) {
          bilibiliPendingRestore = false;
          restoreRecentBilibiliDanmaku(targetVideo);
        } else {
          bilibiliPendingRestore = true;
          resetBilibiliPlaybackCursor(targetVideo.currentTime);
        }
      },
      { signal: controller.signal },
    );
    targetVideo.addEventListener(
      "play",
      () => {
        if (!seeking) {
          processBilibiliDanmaku(targetVideo);
          ensureBilibiliSegments(targetVideo);
        }
      },
      { signal: controller.signal },
    );

    pipDanmakuRenderer.setPlaybackRate(targetVideo.playbackRate);
    if (bilibiliMessagesLoaded) startBilibiliDanmakuAtCurrentTime(targetVideo);
  }

  if (bilibiliMessagesLoaded || bilibiliLoadingSegments.size > 0) return;

  const initialSegment =
    Math.floor(Math.max(0, targetVideo.currentTime) / 120) + 1;
  const initialEndSegment = initialSegment + 2;
  const now = Date.now();
  for (let segment = initialSegment; segment <= initialEndSegment; segment++) {
    if (isBilibiliSegmentCoolingDown(segment, now)) return;
  }

  requestBilibiliSegments(identity, initialSegment, initialEndSegment, {
    initial: true,
  });
}

function processReplayMessages(): void {
  const currentTime = replayVideo?.currentTime;
  if (
    replaySeeking ||
    typeof currentTime !== "number" ||
    !Number.isFinite(currentTime)
  )
    return;

  const dueMessages = [...replayMessages.values()]
    .filter((entry) => !entry.emitted && entry.replayTime <= currentTime + 0.1)
    .sort((a, b) => a.replayTime - b.replayTime);

  for (const entry of dueMessages) {
    entry.emitted = true;
    const elapsed = Math.max(0, currentTime - entry.replayTime);
    if (elapsed > REPLAY_LATE_TOLERANCE_SECONDS) continue;
    broadcastDanmaku(entry.data, { elapsed, restore: elapsed > 0 });
  }
}

function receiveDanmaku(
  data: DanmakuData | null | undefined,
  { initial = false }: { initial?: boolean } = {},
): void {
  if (!data) return;
  if (DANMAKU_IS_YOUTUBE && isYouTubeLiveVideo()) {
    if (!initial) broadcastDanmaku(data);
    return;
  }

  if (
    typeof data.replayTime !== "number" ||
    !Number.isFinite(data.replayTime)
  ) {
    if (!initial) broadcastDanmaku(data);
    return;
  }

  const currentTime = replayVideo?.currentTime;
  const messageKey = data.messageId || Symbol();
  let entry = replayMessages.get(messageKey);
  if (!entry) {
    entry = {
      data,
      replayTime: data.replayTime,
      emitted:
        typeof currentTime === "number" &&
        Number.isFinite(currentTime) &&
        data.replayTime < currentTime - REPLAY_LATE_TOLERANCE_SECONDS,
    };
    replayMessages.set(messageKey, entry);
    if (replayMessages.size > MAX_REPLAY_MESSAGES) {
      const firstKey = replayMessages.keys().next().value;
      if (firstKey !== undefined) replayMessages.delete(firstKey);
    }
  } else {
    entry.data = data;
  }

  if (!initial) processReplayMessages();
}

function unbindReplayVideo(): void {
  replayVideoController?.abort();
  replayVideoController = null;
  replayVideo = null;
  replaySeeking = false;
}

function bindReplayVideo(): void {
  if (!DANMAKU_IS_YOUTUBE || !danmakuSettingsLoaded || !danmakuEnabled) {
    unbindReplayVideo();
    return;
  }

  const videoId = new URL(location.href).searchParams.get("v") || "";
  if (videoId !== replayVideoId) {
    replayMessages.clear();
    clearDanmaku();
    replayVideoId = videoId;
  }

  const video =
    document.querySelector<HTMLVideoElement>("video.html5-main-video") ||
    state.sourceVideo;
  if (video === replayVideo) return;
  unbindReplayVideo();
  replayVideo = video;
  if (!video) return;

  const controller = new AbortController();
  replayVideoController = controller;

  video.addEventListener("timeupdate", processReplayMessages, {
    signal: controller.signal,
  });
  video.addEventListener(
    "seeking",
    () => {
      replaySeeking = true;
      clearDanmaku();
    },
    { signal: controller.signal },
  );
  video.addEventListener(
    "seeked",
    () => {
      const currentTime = video.currentTime;
      replaySeeking = false;
      const restoreWindow = Math.max(
        REPLAY_RESTORE_WINDOW_SECONDS,
        mainDanmakuRenderer?.duration || 0,
        pipDanmakuRenderer?.duration || 0,
      );
      const entries = [...replayMessages.values()].sort(
        (a, b) => a.replayTime - b.replayTime,
      );
      ensureMainRenderer();

      const restoringRenderers = [
        mainDanmakuRenderer,
        pipDanmakuRenderer,
      ].filter((r): r is DanmakuRenderer => r !== null);

      for (const renderer of restoringRenderers) renderer.beginSeekRestore();
      try {
        for (const entry of entries) {
          const elapsed = currentTime - entry.replayTime;
          entry.emitted = elapsed >= 0;
          if (elapsed < 0 || elapsed > restoreWindow) continue;
          broadcastDanmaku(entry.data, { elapsed, restore: true });
        }
      } finally {
        for (const renderer of restoringRenderers) renderer.endSeekRestore();
      }
      processReplayMessages();
    },
    { signal: controller.signal },
  );
  video.addEventListener("play", processReplayMessages, {
    signal: controller.signal,
  });
  processReplayMessages();
}

function isYouTubeLiveVideo(): boolean {
  const player = document.querySelector("#movie_player");
  return Boolean(
    document.querySelector("ytd-watch-flexy[is-live-video]") ||
    player?.classList.contains("ytp-live") ||
    player?.querySelector(".ytp-live-badge"),
  );
}

function getNativeChatIframe(): HTMLIFrameElement | null {
  return (
    document.querySelector<HTMLIFrameElement>(
      "ytd-live-chat-frame iframe#chatframe",
    ) ||
    document.querySelector<HTMLIFrameElement>("iframe#chatframe") ||
    document.querySelector<HTMLIFrameElement>("ytd-live-chat-frame iframe")
  );
}

function removeBackgroundChatFrame(): void {
  if (!backgroundChatFrame) return;
  if (observedChatFrame === backgroundChatFrame) resetChatObservers();
  backgroundChatFrame.remove();
  backgroundChatFrame = null;
}

function createBackgroundChatFrame(): HTMLIFrameElement | null {
  const videoId = new URL(location.href).searchParams.get("v");
  if (!videoId) {
    removeBackgroundChatFrame();
    return null;
  }

  const player = document.querySelector("#movie_player");
  const hasLiveChat = Boolean(
    document.querySelector("ytd-live-chat-frame") ||
    player?.classList.contains("ytp-live") ||
    player?.querySelector(".ytp-live-badge"),
  );
  if (!hasLiveChat) {
    removeBackgroundChatFrame();
    return null;
  }

  const chatUrl = new URL("/live_chat", location.origin);
  chatUrl.searchParams.set("v", videoId);
  chatUrl.searchParams.set("is_popout", "1");
  if (backgroundChatFrame?.src === chatUrl.href) return backgroundChatFrame;
  removeBackgroundChatFrame();

  const frame = document.createElement("iframe");
  frame.title = "YouTube 聊天室訊息來源";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.src = chatUrl.href;
  frame.style.cssText =
    "position:fixed!important;left:-10000px!important;top:0!important;width:320px!important;height:480px!important;visibility:hidden!important;pointer-events:none!important;border:0!important;";
  frame.addEventListener("load", () => {
    window.setTimeout(checkAndBindDanmakuChat, 400);
  });
  backgroundChatFrame = frame;
  (document.body || document.documentElement).appendChild(frame);
  return frame;
}

function hasChatItems(chatFrame: HTMLIFrameElement): boolean {
  try {
    const chatDoc =
      chatFrame.contentDocument || chatFrame.contentWindow?.document;
    return Boolean(chatDoc && findChatItemsContainer(chatDoc));
  } catch {
    return false;
  }
}

function getChatIframe(): HTMLIFrameElement | null {
  if (!DANMAKU_IS_YOUTUBE || !danmakuSettingsLoaded || !danmakuEnabled) {
    removeBackgroundChatFrame();
    return null;
  }

  const nativeChatFrame = getNativeChatIframe();
  if (nativeChatFrame && hasChatItems(nativeChatFrame)) {
    removeBackgroundChatFrame();
    return nativeChatFrame;
  }

  return createBackgroundChatFrame() || nativeChatFrame;
}

function resetChatObservers(): void {
  chatObserver?.disconnect();
  chatObserver = null;
  chatDocumentObserver?.disconnect();
  chatDocumentObserver = null;
  observedChatDocument = null;
  observedChatFrame = null;
  observedItemsNode = null;
}

function findChatItemsContainer(chatDoc: Document): Element | null {
  return (
    chatDoc.querySelector("yt-live-chat-item-list-renderer #items") ||
    chatDoc.querySelector("#item-list #items") ||
    chatDoc.querySelector("#items.yt-live-chat-item-list-renderer")
  );
}

function waitForChatItems(
  chatFrame: HTMLIFrameElement,
  chatDoc: Document,
): void {
  if (observedChatDocument === chatDoc && chatDocumentObserver) return;
  chatDocumentObserver?.disconnect();
  observedChatDocument = chatDoc;
  const observer = new MutationObserver(() => {
    if (!findChatItemsContainer(chatDoc)) return;
    observer.disconnect();
    if (chatDocumentObserver === observer) {
      chatDocumentObserver = null;
      observedChatDocument = null;
    }
    if (chatFrame === observedChatFrame) checkAndBindDanmakuChat();
  });
  if (!chatDoc.documentElement) {
    observedChatDocument = null;
    return;
  }
  chatDocumentObserver = observer;
  observer.observe(chatDoc.documentElement, { childList: true, subtree: true });
}

function checkAndBindDanmakuChat(): void {
  if (!DANMAKU_IS_YOUTUBE) return;
  const chatFrame = getChatIframe();
  if (!chatFrame) {
    unbindReplayVideo();
    resetChatObservers();
    return;
  }

  bindReplayVideo();
  if (chatFrame !== observedChatFrame) {
    resetChatObservers();
    observedChatFrame = chatFrame;
  }

  let chatDoc: Document | null = null;
  try {
    chatDoc =
      chatFrame.contentDocument || chatFrame.contentWindow?.document || null;
  } catch {
    return;
  }
  if (!chatDoc) return;

  const itemsContainer = findChatItemsContainer(chatDoc);
  if (!itemsContainer) {
    waitForChatItems(chatFrame, chatDoc);
    if (!chatFrame.dataset.ytDanmakuLoadBound) {
      chatFrame.dataset.ytDanmakuLoadBound = "true";
      chatFrame.addEventListener("load", () => {
        window.setTimeout(checkAndBindDanmakuChat, 400);
      });
    }
    return;
  }

  chatDocumentObserver?.disconnect();
  chatDocumentObserver = null;
  observedChatDocument = null;
  if (itemsContainer === observedItemsNode) return;

  chatObserver?.disconnect();
  observedItemsNode = itemsContainer;

  const existing = itemsContainer.querySelectorAll(
    "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
  );
  existing.forEach((node) => {
    const data = extractMessageFromNode(node);
    if (data) receiveDanmaku(data, { initial: true });
  });
  processReplayMessages();

  chatObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;
        const data = extractMessageFromNode(addedNode);
        if (data) {
          receiveDanmaku(data);
        } else if ((addedNode as Element).querySelectorAll) {
          const children = (addedNode as Element).querySelectorAll(
            "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
          );
          children.forEach((child) => {
            const childData = extractMessageFromNode(child);
            if (childData) receiveDanmaku(childData);
          });
        }
      }
    }
  });

  chatObserver.observe(itemsContainer, { childList: true, subtree: true });
}

const TWITCH_CHAT_ROOT_SELECTOR =
  '[data-test-selector="chat-scrollable-area__message-container"], .chat-scrollable-area__message-container, [data-a-target="chat-scroller"], .video-chat__message-list-wrapper ul';
const TWITCH_MESSAGE_SELECTOR =
  '[data-a-target="chat-line-message"], .chat-line__message, [data-test-selector="chat-line-message"], [data-test-selector="chat-line"], .vod-message';
const TWITCH_VOD_MESSAGE_SELECTOR = ".video-chat__message-list-wrapper ul > *";

function isTwitchVodPage(): boolean {
  return DANMAKU_IS_TWITCH && /^\/videos\/\d+/.test(location.pathname);
}

const BAHAMUT_DANMAKU_SELECTOR =
  '[class*="danmu" i], [class*="danmaku" i], [id*="danmu" i], [id*="danmaku" i]';
const BILIBILI_LIVE_DANMAKU_SELECTOR = ".danmaku-item";

function getSiteDanmakuRoot(): Element | null {
  if (DANMAKU_IS_TWITCH) {
    const chatRoot = document.querySelector(TWITCH_CHAT_ROOT_SELECTOR);
    if (chatRoot) return chatRoot;

    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const frameRoot = frame.contentDocument?.querySelector(
          TWITCH_CHAT_ROOT_SELECTOR,
        );
        if (frameRoot) return frameRoot;
      } catch {}
    }

    return location.pathname.startsWith("/videos/") ? document.body : null;
  }
  if (DANMAKU_IS_BILIBILI_LIVE) return document.querySelector("#chat-items");
  if (!DANMAKU_IS_BAHAMUT) return null;

  const video = document.querySelector("video");
  return (
    video?.closest(
      ".anime_video_area, .anime-video-area, #ani_video, .video-js",
    ) ||
    video?.parentElement?.parentElement?.parentElement ||
    document.body
  );
}

function getSiteDanmakuCandidates(node: Node): Element[] {
  const selector = DANMAKU_IS_TWITCH
    ? isTwitchVodPage()
      ? TWITCH_VOD_MESSAGE_SELECTOR
      : TWITCH_MESSAGE_SELECTOR
    : DANMAKU_IS_BILIBILI_LIVE
      ? BILIBILI_LIVE_DANMAKU_SELECTOR
      : BAHAMUT_DANMAKU_SELECTOR;
  const candidates: Element[] = [];
  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    if (element.matches(selector)) candidates.push(element);
    candidates.push(...element.querySelectorAll(selector));
  } else if (node.parentElement) {
    const candidate = node.parentElement.closest(selector);
    if (candidate) candidates.push(candidate);
  }

  if (DANMAKU_IS_BAHAMUT)
    return candidates.filter((candidate) => !candidate.querySelector(selector));
  return candidates;
}

function extractSiteDanmaku(node: Element): DanmakuData | null {
  let messageNode = node;
  let author = "";
  if (DANMAKU_IS_BILIBILI_LIVE) {
    const liveMessage = node as HTMLElement & {
      danmaku?: string;
      uname?: string;
    };
    author = (
      liveMessage.uname ||
      node.getAttribute("data-uname") ||
      node.querySelector(".user-name")?.textContent ||
      ""
    ).trim();
    messageNode = node.querySelector(".danmaku-item-right") || node;
    const { parts, text } = extractMessageContent(messageNode);
    const danmakuText = liveMessage.danmaku?.trim();
    if (!text && danmakuText) {
      return {
        text: danmakuText,
        parts: [{ type: "text", text: danmakuText }],
        author,
      };
    }
    return text ? { text, parts, author } : null;
  }
  if (DANMAKU_IS_TWITCH) {
    const body = node.querySelector(
      '[data-a-target="chat-line-message-body"], [data-a-target="chat-message-text"], .text-fragment, .message',
    );
    if (body) messageNode = body;
    const authorNode = node.querySelector(
      '[data-a-target="chat-message-username"], .chat-author__display-name',
    );
    author = (authorNode?.textContent || "").trim();
  }

  const { parts, text } = extractMessageContent(messageNode);
  if (!text) return null;
  return { text, parts, author };
}

function processSiteDanmakuNode(node: Node, initial = false): void {
  for (const candidate of getSiteDanmakuCandidates(node)) {
    const data = extractSiteDanmaku(candidate);
    if (!data) continue;
    const signature = `${data.author || ""}\u0000${data.text || ""}`;
    if (processedSiteDanmaku.get(candidate) === signature) continue;
    processedSiteDanmaku.set(candidate, signature);
    if (!initial) broadcastDanmaku(data);
  }
}

function checkAndBindSiteDanmaku(): void {
  if (!DANMAKU_IS_TWITCH && !DANMAKU_IS_BAHAMUT && !DANMAKU_IS_BILIBILI_LIVE)
    return;
  if (!danmakuSettingsLoaded || !danmakuEnabled) {
    siteDanmakuObserver?.disconnect();
    siteDanmakuObserver = null;
    siteDanmakuRoot = null;
    return;
  }

  const root = getSiteDanmakuRoot();
  if (!root) return;
  if (root === siteDanmakuRoot && siteDanmakuObserver) return;
  siteDanmakuObserver?.disconnect();
  siteDanmakuRoot = root;

  const initialSelector = DANMAKU_IS_TWITCH
    ? isTwitchVodPage()
      ? TWITCH_VOD_MESSAGE_SELECTOR
      : TWITCH_MESSAGE_SELECTOR
    : DANMAKU_IS_BILIBILI_LIVE
      ? BILIBILI_LIVE_DANMAKU_SELECTOR
      : BAHAMUT_DANMAKU_SELECTOR;
  root.querySelectorAll(initialSelector).forEach((node) => {
    processSiteDanmakuNode(node, true);
  });

  siteDanmakuObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) processSiteDanmakuNode(node);
      if (mutation.type === "characterData")
        processSiteDanmakuNode(mutation.target);
    }
  });
  siteDanmakuObserver.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

Object.assign(globalThis, {
  toggleDanmaku,
  initDanmakuInPip,
  destroyDanmakuInPip,
  setDanmakuPaused,
  setDanmakuPlaybackRate,
  isDanmakuEnabled,
  checkAndBindDanmakuChat,
  checkAndBindBilibiliDanmaku,
  checkAndBindSiteDanmaku,
  broadcastDanmaku,
});

if (DANMAKU_IS_YOUTUBE) {
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(checkAndBindDanmakuChat, 600);
  });

  checkAndBindDanmakuChat();
}
