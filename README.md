# 幕伴 PiP · PiP Companion

---

讓網頁影片在子母畫面繼續播放，字幕、控制與 YouTube 留言也隨手可用。

## 功能

- **子母畫面播放**：使用 Chrome [Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture/) API 將頁面影片放入獨立浮窗；關閉浮窗後影片會回到原頁面。
- **浮窗播放控制**：播放／暫停、進度拖曳與時間跳轉、下一部影片、0.25×–5× 倍速、音量與靜音。瀏覽器允許時可將音量提高至 300%。
- **字幕**：讀取影片文字軌或頁面上可辨識的字幕，並可在浮窗切換顯示。
- **YouTube 浮動留言區**：將留言區顯示為側邊欄；窄螢幕或劇院模式下改用底部面板。
- **影片截圖**：將目前畫面儲存為 PNG
- **自訂快捷鍵**：在擴充功能選單中重新設定開啟浮窗、留言區和截圖快捷鍵。

### PiP 快捷鍵

| 操作                    | 預設快捷鍵            |
| ----------------------- | --------------------- |
| 開啟浮窗                | `Alt+Shift+P`         |
| 開啟 YouTube 浮動留言區 | `Alt+C`               |
| 截圖                    | `Alt+P`               |
| 播放／暫停              | `Space`               |
| 快退／快進 5 秒         | `←` / `→`             |
| 音量控制（每次 10%）    | `↓` / `↑`             |
| 靜音                    | `M`                   |
| 字幕開關                | `C`                   |
| 逐格後退／前進          | `,` / `.`             |
| 倍速控制                | `Shift+,` / `Shift+.` |

在擴充功能選單中點擊快捷鍵即可錄製新組合；按 `Esc` 可取消。快捷鍵設定保存在瀏覽器本機。

## 相容性與限制

- 需要 **Chrome 116 或更新版本**；Document Picture-in-Picture 在其他瀏覽器中的支援度不同。
- 影片偵測會搜尋頁面中的影片與可存取的 Shadow DOM／iframe；跨來源 iframe 通常無法由外層頁面存取。
- 字幕取自影片文字軌或頁面已呈現、且可存取的字幕內容；網站改版可能影響偵測。
- 跨來源影片可能受 Canvas 安全限制而無法截圖。
- 音量超過 100% 需要 Web Audio。來源影片被其他擴充功能接入音訊，或受跨來源限制時，音量上限可能回到原生的 100%。

## 隱私

擴充功能沒有自有後端，也不會將設定傳送至遠端服務。快捷鍵與功能開關儲存在 `chrome.storage.local`；影片播放和截圖在瀏覽器本機處理。網頁仍會依照其自身行為連線至影片服務。

## 開發

需要 Node.js 與 npm。常用檢查指令：

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
```

主要目錄：

- `src/content/`：影片偵測、浮窗播放控制、字幕、音訊處理與 YouTube 浮動留言區
- `src/popup/`：擴充功能選單與快捷鍵設定
- `src/shared/`：共用工具與 TypeScript 型別
- `src/background.ts`：處理浮窗尺寸調整訊息
- `scripts/build.mjs`：複製靜態檔案與圖示至 `dist/`

## 支持

如果你喜歡這個專案，歡迎贊助我一杯奶茶 ヾ(_´∀`_)ﾉ

<a href="https://www.buymeacoffee.com/kir4che" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-red.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;" ></a>
