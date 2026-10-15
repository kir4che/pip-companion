# 幕伴 PiP · PiP Companion

<p align="right">
  <a href="https://chromewebstore.google.com/detail/%E5%B9%95%E4%BC%B4-pip-%C2%B7-pip-companion/gnfofimkbdmkbjejmkdmihdpemlgejlm?utm_source=item-share-cb"><img align="left" height="20" src="https://img.shields.io/chrome-web-store/v/gnfofimkbdmkbjejmkdmihdpemlgejlm?label=chrome" alt="Chrome 線上應用程式商店版本" /></a>
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | 繁體中文
</p>

讓網頁影片在子母畫面中播放，支援字幕、彈幕、截圖與浮動留言區。

<p align="center">
  <img src="docs/images/pip-companion-social-preview.zh-TW.png" alt="幕伴 PiP 宣傳主圖" width="960" />
</p>

> 遇到問題或有功能建議，請到 [Issues](https://github.com/kir4che/pip-companion/issues) 回報。

## 功能

- **子母畫面（PiP）控制**：播放／暫停、進度條拖曳、音量、倍速、逐格、播放下集等完整控制
  - **音量放大**：同源影片最高可提高至 300%；跨來源影片可能僅支援至 100%。
  - **倍速播放**：可將播放速度調整至 0.25 – 5×；在直播中會自動隱藏倍速按鈕以保持同步，且部分網站可能會限制。
  - **進度條與預覽**：控制列隱藏時底部仍常駐顯示迷你進度條，且滑鼠懸停可預覽縮圖（縮圖僅支援 YouTube、Bilibili 與巴哈動畫瘋）。
  - **輸入時間跳轉**：可直接輸入影片時間並跳轉至該時間點
  - **雙語字幕**：在 PiP 中顯示可讀取的字幕，可依影片提供的語言切換字幕軌。
    - 樣式自定義
    - 第二字幕可用影片原生字幕軌，或串接 Microsoft Translator、Google Cloud Translation、DeepL 即時翻譯（需自備 API 金鑰）。
  - **播放清單**（僅支援 YouTube、Bilibili 與巴哈動畫瘋）
- **彈幕**：
  - 原生彈幕（Bilibili、巴哈動畫瘋）顯示
  - 聊天室（YouTube、Twitch）轉彈幕並顯示
  - 彈幕輸入（巴哈動畫瘋、YouTube 直播、Bilibili）
  - 樣式自定義
  - **額外彈幕**：可將 Bilibili、巴哈動畫瘋或 Twitch 的彈幕／聊天室疊加到其他影片上
- **浮動留言區**：將 YouTube、Bilibili 留言區展開為浮動面板，觀看影片時也能瀏覽留言。
- **截圖**：將影片畫面存成 PNG
- **影片跟隨**：開啟後，當 PiP 來源暫停，而其他頁面（或同頁）有影片正在播放時，會將 PiP 交接過去；受瀏覽器限制，跨分頁交接需在該分頁點一下。
- **功能開關與快捷鍵**：可分別開關彈幕、截圖、浮動留言區與影片跟隨功能，並自訂「開關 PiP、留言區、截圖與彈幕」快捷鍵。
- **多語系介面**：支援繁體中文、簡體中文與英文，可在設定頁切換。
- **嵌入影片**：偵測符合條件的 iframe 影片；跨網域相容性仍受網站結構與瀏覽器權限影響，無法保證所有播放器都能使用。

> 各平台支援與限制請參閱[平台支援對照](docs/platform-support.zh-TW.md)

## 畫面預覽

| YouTube                                                   | Bilibili                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| ![YouTube 子母畫面示意](docs/images/youtube-pip-demo.png) | ![Bilibili 子母畫面示意](docs/images/bilibili-pip-demo.png) |

### 雙語字幕跨平台示範

| Coursera                                                                           | YouTube                                                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ![Coursera 子母畫面雙語字幕示範](docs/images/coursera-pip-bilingual-subtitles.png) | ![YouTube 子母畫面雙語字幕示範](docs/images/youtube-pip-bilingual-subtitles.png)                                |
| iQIYI                                                                              | Netflix                                                                                                         |
| ![iQIYI 子母畫面雙語字幕示範](docs/images/iqiyi-pip-bilingual-subtitles.png)       | ![Netflix 子母畫面雙語字幕示範（影片因 DRM 保護而呈現黑畫面）](docs/images/netflix-pip-bilingual-subtitles.png) |

## 操作與快捷鍵

- 開啟子母畫面：先開啟有影片的網頁，就能透過選單中的「開啟子母畫面」按鈕或在影片頁面按 `Shift + Alt/Opt + P` 來開啟或關閉子母畫面。
- 自訂快捷鍵：開啟擴充功能的「所有設定」頁面，在「快捷鍵」區點選要修改的快捷鍵，再按下新的組合。

| 操作              | 預設快捷鍵                |
| ----------------- | ------------------------- |
| 開啟子母畫面      | `Shift + Alt/Opt + P`     |
| 播放／暫停        | `Space`                   |
| 跳轉（預設 5 秒） | `←` / `→`                 |
| 調整音量          | `↓` / `↑`                 |
| 靜音              | `M`                       |
| 字幕              | `C`                       |
| 彈幕              | `D`                       |
| 彈幕輸入          | `Enter`                   |
| 浮動留言區        | `Alt/Opt + C`             |
| 截圖              | `Alt/Opt + P`             |
| 調整播放速度      | `Shift + ,` / `Shift + .` |
| 逐格播放          | `,` / `.`                 |
| 自動調整比例      | `R`                       |
| 調整 PiP 大小     | `Ctrl/Cmd + 滾輪`         |

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

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/kir4che)
