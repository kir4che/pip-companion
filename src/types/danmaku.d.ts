// 讓其他模組使用的頁面彈幕操作
declare function toggleDanmaku(forceState?: boolean): boolean;
declare function initDanmakuInPip(win: Window, video: HTMLVideoElement): void;
declare function destroyDanmakuInPip(): void;
declare function setDanmakuPaused(paused: boolean): void;
declare function setDanmakuPlaybackRate(rate: number): void;
declare function isDanmakuEnabled(): boolean;
declare function checkAndBindDanmakuChat(): void;
declare function checkAndBindBilibiliDanmaku(
  video: HTMLVideoElement | null,
): void;
