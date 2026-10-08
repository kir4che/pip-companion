// 補充瀏覽器與 YouTube 播放器的型別定義
interface Window {
  documentPictureInPicture?: {
    requestWindow(options?: {
      width?: number;
      height?: number;
    }): Promise<Window>;
  } | null;
}

interface YouTubePlayer extends HTMLElement {
  nextVideo?: () => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  toggleSubtitles?: () => void;
  getVideoData?: () => { isLive?: boolean };
}
