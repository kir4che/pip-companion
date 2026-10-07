# 幕伴 PiP · PiP Companion

讓網頁影片在子母畫面中播放，支援字幕、彈幕、截圖與 YouTube 浮動留言區。

## 功能

- 使用 Chrome Document Picture-in-Picture 將影片移至獨立浮窗，提供播放、進度、倍速與音量控制。
- 自動偵測頁面及符合條件的 iframe 內影片；跨網域播放器仍受網站結構與瀏覽器限制，無法保證所有平台相容。
- 顯示可讀取的字幕；支援 YouTube 聊天室與 Bilibili 彈幕。
- 在 YouTube 浮動顯示留言區，並可將影片畫面存成 PNG。
- 可自訂快捷鍵；關閉留言區或截圖功能時，對應按鈕與快捷鍵也會停用。

## 使用

點擊工具列圖示開啟或關閉浮窗。快捷鍵可在擴充功能彈出視窗中點擊欄位後重新設定，按 `Esc` 取消。

預設快捷鍵：開啟浮窗 `Alt+Shift+P`、留言區 `Alt+C`、截圖 `Alt+P`、彈幕 `Alt+D`。

浮窗內固定快捷鍵：`Space` 播放／暫停、`←`／`→` 跳轉、`↑`／`↓` 音量、`C` 字幕、`M` 靜音、`,`／`.` 逐格、`Shift+,`／`Shift+.` 倍速。

## 安裝

需要 Chrome 116 或更新版本。在專案目錄執行 `npm ci`、`npm run build`，接著前往 `chrome://extensions`，開啟「開發人員模式」，並載入 `dist/` 資料夾。

## 限制與隱私

跨來源影片可能無法截圖或將音量提高至 100% 以上；字幕也需網站提供可讀取的字幕內容。為偵測影片，內容指令碼會在符合條件的網頁與嵌入框架中執行，並於本機檢查頁面。快捷鍵與功能設定儲存在瀏覽器本機。擴充功能沒有自有後端；Bilibili 彈幕透過 Bilibili API 載入。

## 開發

```bash
npm run lint
npm run typecheck
npm run build
```

## 支持

如果你喜歡這個專案，歡迎贊助我一杯奶茶 ヾ(_´∀`_)ﾉ

<a href="https://www.buymeacoffee.com/kir4che" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-red.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;" ></a>
