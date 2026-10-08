# 幕伴 PiP · PiP Companion

English | [繁體中文](README.zh-TW.md)

A browser extension that brings web videos into Picture-in-Picture, with captions, danmaku, screenshots, and floating comments panels.

> For problems or feature requests, please report them in [Issues](https://github.com/kir4che/pip-companion/issues).

## Features

- **Picture-in-Picture controls:** play/pause, scrub the timeline, volume, playback speed, frame stepping, and more.
  - **Play next video:** automatically detects the page's "Next video / Next episode" button when available.
  - **Volume boost:** same-origin videos can be boosted up to 300%; cross-origin videos may be limited to 100%.
  - **Playback speed:** adjust from 0.25× to 5×; automatically hidden during live streams to preserve sync, and some websites may impose limits.
  - **Progress bar & previews:** keeps the mini progress bar visible at the bottom when controls fade out, and hover over the seek bar to preview thumbnails (supported on YouTube, Bilibili, and Bahamut Anime Crazy).
  - **Jump to a timestamp:** enter a video time to jump directly to that point.
- **Captions:** display captions readable from the video in the PiP window.
- **Danmaku sources:**
  - Bilibili
  - Twitch
  - Bahamut
  - YouTube Live
- **Floating comments:** open the comments panel on YouTube and Bilibili video pages while watching.
- **Screenshots:** save the video frame as a PNG file.
- **Keyboard shortcuts:** customize shortcuts for opening or closing PiP, comments, screenshots, and danmaku.
- **Embedded videos:** detect videos in matching iframes. Cross-origin compatibility depends on the website and browser permissions, so not every player is guaranteed to work.

## Controls and Shortcuts

Click the toolbar icon to open or close the PiP window. To customize a shortcut, click its field in the extension popup and press a new key combination. Press `Esc` to cancel.

Default shortcuts:

| Action                   | Shortcut      |
| ------------------------ | ------------- |
| Open or close PiP        | `Alt+Shift+P` |
| Toggle floating comments | `Alt+C`       |
| Take a screenshot        | `Alt+P`       |
| Toggle danmaku           | `Alt+D`       |

Shortcuts inside the PiP window:

| Action                | Shortcut              |
| --------------------- | --------------------- |
| Play or pause         | `Space`               |
| Seek                  | `←` / `→`             |
| Adjust volume         | `↑` / `↓`             |
| Toggle captions       | `C`                   |
| Toggle mute           | `M`                   |
| Step one frame        | `,` / `.`             |
| Adjust playback speed | `Shift+,` / `Shift+.` |

## Installation

Requires Chrome 116 or later. From the project directory, run `npm ci` and `npm run build`. Then open `chrome://extensions`, enable Developer mode, and load the `dist/` directory.

## Development

Requires Node.js 22 LTS or later. Install dependencies with `npm ci`, then run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Support

If you enjoy this project, you can buy me a cup of milk tea ヾ(_´∀`_)ﾉ

<a href="https://www.buymeacoffee.com/kir4che" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-red.png" alt="Buy Me a Coffee" style="height: 60px !important;width: 217px !important;"></a>
