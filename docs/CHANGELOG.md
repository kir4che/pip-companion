## 0.6.0

- Added danmaku keyword search inside PiP with dynamic Top 3 highlight timestamps
- Added danmaku timestamp tag recognition (e.g., "空降 MM:SS") with clickable jump boxes and opt-in forward-only auto jump
- Added danmaku keyword filtering with a management interface supporting plain text and regular expressions (Regex)
- Added customizable PiP player controls to reorder, show, or hide control items via drag-and-drop in settings
- Added customizable PiP theme colors for player controls and progress bars
- Added seek-bar thumbnail previews for Bilibili Bangumi series
- Improved YouTube replay chat sync tolerance and native fallback, and ensured single-track subtitle discovery and icon visibility
- Fixed Bilibili Bangumi playlist recognition and episode switch danmaku updates, and optimized segment danmaku preloading
- Fixed Twitch VOD danmaku timestamp fallback to align with the bound video's current playback time
- Improved danmaku deduplication, ensured danmaku clears immediately upon seeking, and strictly synchronized native subtitle toggle state
- Avoided hover preview videos during PiP video scanning, adjusted time-tooltip positioning, and refined toast notification handling

## 0.5.0

- Added multi-track and bilingual subtitles, with live translation via Microsoft Translator, Google Cloud Translation, or DeepL (bring your own API key)
- Added extra danmaku sources from Bilibili, Bahamut, Twitch, and YouTube
- Added Netflix seek-bar thumbnail previews
- Added a setting to pause playback when PiP closes
- Added generic episode navigation and improved native subtitle and Video.js overlay detection
- Improved PiP playback recovery and continuity when websites replace videos, including native PiP for accessible embedded videos
- Fixed hover previews interrupting PiP video selection and page-level hover blocking video transitions
- Improved subtitle request recovery, PiP cleanup, and extension messaging reliability

## 0.5.0-beta.1

- Migrated captions to subtitles with multi-track switching and bilingual display
- Added live subtitle translation via Microsoft Translator, Google Cloud Translation, or DeepL (bring your own API key)
- Added extra danmaku sources to overlay Bilibili, Bahamut, or Twitch danmaku/chat onto other videos
- Fixed PiP next-button lookup being scoped to player containers
- Fixed PiP control focus and panel dismissal behavior
- Fixed premature PiP close during async teardown
- Fixed duplicate content script injection

## 0.4.0

- Added a localized interface in English, Traditional Chinese, and Simplified Chinese, with a language selector
- Added a dedicated settings page to customize shortcuts, seek interval, feature toggles, and caption and danmaku appearance
- Added a toggle for seek thumbnail previews, available in the popup and settings page

## 0.3.1

- Fixed Bilibili storyboard thumbnails loading for the wrong video part or failing to load reliably
- Fixed PiP follow switching to a video playing only as a hover preview

## 0.3.0

- Added shared PiP playlists for YouTube, Bilibili, and Bahamut Anime Crazy, with per-video durations when available
- Fixed Netflix PiP seeking and improved cross-platform playback recovery and next-video continuity
- Improved accessibility across the popup, PiP, and floating comments, including keyboard and screen-reader support
- Improved live-stream time display and refined playlist, control-bar, and danmaku input behavior

## 0.2.0

- Added PiP danmaku input controls for supported platforms #5
- Added the `R` shortcut to automatically adjust the PiP window to the video's aspect ratio
- Added a configurable seek interval of 1, 3, 5, 10, 15, or 30 seconds, with 5 seconds as the default
- PiP can now open before the video is ready to play
- Improved PiP lifecycle cleanup and extension messaging reliability

## 0.1.0

- Picture-in-Picture playback controls for play/pause, seeking, volume, playback speed, frame stepping, and jumping to a timestamp
- Subtitle display in PiP, with customizable font, size, color, and other styles #5
- Danmaku support for Bilibili and Bahamut Anime Crazy, plus YouTube Live and Twitch chat messages
- Floating comments panels on YouTube and Bilibili video pages
- Video screenshots saved as PNG files
- Seek-bar thumbnail previews on YouTube, Bilibili, and Bahamut Anime Crazy
- Keyboard shortcuts and popup settings for toggling features and customizing danmaku appearance #5
- Detection of videos in supported embedded frames, subject to website and browser limitations
