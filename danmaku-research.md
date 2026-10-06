# 彈幕功能實作規劃

> `yt-caption-pip` 擴充功能新增 YouTube 直播聊天室彈幕 overlay

---

## 範圍定義

- **彈幕** = YouTube 直播聊天室（`yt-live-chat-*`）訊息疊加在影片上
- **不相關**：`floating-comments.js` 是影片留言區（`#comments`），與彈幕完全無關，不動

---

## 新增檔案

### `danmaku.js` — 完全獨立模組

#### 1. 資料來源：監聽直播聊天室

- `MutationObserver` 掛在 `yt-live-chat-item-list-renderer`
- 擷取 `yt-live-chat-text-message-renderer`（一般訊息）
- 擷取 `yt-live-chat-paid-message-renderer`（SuperChat，帶顏色）
- 只在直播 / Premiere 頁面啟動（偵測 `ytd-live-chat-frame` 是否存在）

#### 2. 渲染：Overlay 疊在主播放器上

- 在 `#movie_player` 內注入 `position:absolute; pointer-events:none` 的 overlay div
- 每條訊息生成一個 `<span>`，CSS `@keyframes` 從右到左滾動
- Lane 管理：N 條水平軌道，新訊息分配到最早空出的軌道，防止重疊
- PiP 浮窗：在 PiP window document 裡也建立同樣的 overlay，同步接收訊息

#### 3. 控制 UI

- **Popup** 新增開關 toggle（`danmakuEnabled`，存 `chrome.storage.local`）
- **快捷鍵** `Alt+D` 切換開關
- SuperChat 用背景顏色區分（沿用 YouTube 原本付費訊息顏色）

---

## 改動現有檔案

| 檔案            | 改動內容                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| `manifest.json` | `content_scripts.js` 陣列加入 `"danmaku.js"`                                              |
| `content.js`    | `onPageKeyDown` 加 `Alt+D` 分支；`openPiP` 建立 PiP window 後呼叫 `initDanmakuInPip(win)` |
| `popup.html`    | 新增彈幕開關一行                                                                          |
| `popup.js`      | 讀寫 `danmakuEnabled` storage key                                                         |

---

## 不做的事

- 不引入任何外部 library
- 不新增 `host_permissions` 或網路請求
- 不動 `floating-comments.js`
- 不支援非直播影片（無聊天室來源）
