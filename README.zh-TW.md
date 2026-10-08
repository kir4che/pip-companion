# 幕伴 PiP · PiP Companion

[English](README.md) | 繁體中文

讓網頁影片在子母畫面中播放，支援字幕、彈幕、截圖與浮動留言區。

> 遇到問題或有功能建議，請到 [Issues](https://github.com/kir4che/pip-companion/issues) 回報。

## 功能

- **子母畫面（PiP）控制**：播放／暫停、進度條拖曳、音量、倍速、逐格等完整控制
  - **播放下一部**：自動偵測網頁中的「下一部影片／下一集」按鈕
  - **音量放大**：同源影片最高可提高至 300%；跨來源影片可能僅支援至 100%。
  - **倍速播放**：可將播放速度調整至 0.25 – 5×；在直播中會自動隱藏倍速按鈕以保持同步，且部分網站可能會限制。
  - **進度條與預覽**：控制列隱藏時底部仍常駐顯示迷你進度條，且滑鼠懸停可預覽縮圖（支援 YouTube、Bilibili 與巴哈動畫瘋）。
  - **輸入時間跳轉**：可直接輸入影片時間並跳轉至該時間點
- **字幕**：在 PiP 中顯示影片上可讀取的字幕
- **彈幕來源**：
  - Bilibili
  - Twitch
  - 巴哈動畫瘋
  - YouTube 直播
- **浮動留言區**：將 YouTube、Bilibili 留言區展開為浮動面板，觀看影片時也能瀏覽留言。
- **截圖**：將影片畫面存成 PNG
- **快捷鍵**：可自訂「開關 PiP、留言區、截圖與彈幕」快捷鍵
- **嵌入影片**：偵測符合條件的 iframe 影片；跨網域相容性仍受網站結構與瀏覽器權限影響，無法保證所有播放器都能使用。

## 操作與快捷鍵

點擊工具列圖示開啟或關閉浮窗。可在擴充功能彈出視窗中點擊快捷鍵欄位，再按下新的組合鍵進行設定；按 `Esc` 取消。

預設快捷鍵：

| 操作           | 快捷鍵        |
| -------------- | ------------- |
| 開啟或關閉浮窗 | `Alt+Shift+P` |
| 切換浮動留言區 | `Alt+C`       |
| 截圖           | `Alt+P`       |
| 切換彈幕       | `Alt+D`       |

浮窗內快捷鍵：

| 操作         | 快捷鍵                |
| ------------ | --------------------- |
| 播放／暫停   | `Space`               |
| 跳轉         | `←` / `→`             |
| 調整音量     | `↑` / `↓`             |
| 切換字幕     | `C`                   |
| 靜音         | `M`                   |
| 逐格播放     | `,` / `.`             |
| 調整播放速度 | `Shift+,` / `Shift+.` |

## 安裝

需要 Chrome 116 或更新版本，在專案目錄執行 `npm ci`、`npm run build`，接著前往 `chrome://extensions`，開啟「開發人員模式」，並載入 `dist/` 資料夾。

## 開發

需要 Node.js 22 LTS 或更新版本，先執行 `npm ci` 安裝依賴，再使用以下指令：

```bash
npm run lint
npm run typecheck
npm run build
```

## 支持

如果你喜歡這個專案，歡迎贊助我一杯奶茶 ヾ(_´∀`_)ﾉ

<a href="https://www.buymeacoffee.com/kir4che" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-red.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;" ></a>
