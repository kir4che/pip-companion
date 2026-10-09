// 補充瀏覽器與 YouTube 播放器的型別定義
interface Window {
  animefun?: { videoSn?: string | number };
  videojs?: {
    getPlayer?: (id: string) => unknown;
    players?: Record<string, unknown>;
  };
  ytInitialPlayerResponse?: unknown;
  ytplayer?: {
    config?: {
      args?: Record<string, unknown>;
    };
  };
  ytcfg?: {
    get?: (key: string) => unknown;
    data_?: Record<string, unknown>;
  };
  documentPictureInPicture?: {
    requestWindow(options?: {
      width?: number;
      height?: number;
    }): Promise<Window>;
  } | null;
}

interface YouTubePlayer extends HTMLElement {
  getStoryboardFormat?: () => string;
  getPlayerResponse?: () => unknown;
  nextVideo?: () => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  toggleSubtitles?: () => void;
  getVideoData?: () => { isLive?: boolean; video_id?: string };
}
