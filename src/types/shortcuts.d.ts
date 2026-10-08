// 擴充功能彈出視窗與頁面共用的快捷鍵資料
interface Shortcut {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

type ShortcutKey =
  | "launchShortcut"
  | "commentsShortcut"
  | "screenshotShortcut"
  | "danmakuShortcut";
