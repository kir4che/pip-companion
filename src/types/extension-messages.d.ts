type SimpleExtensionMessageType =
  | "PING"
  | "GET_PIP_STATE"
  | "CLOSE_PIP"
  | "CLOSE_ALL_PIP"
  | "GET_PIP_BOUNDS"
  | "REQUEST_PIP_HANDOFF";

type ExtensionMessage =
  | { type: SimpleExtensionMessageType }
  | { type: "OPEN_PIP" }
  | {
      type: "PIP_STATE_CHANGED";
      pipOpen: boolean;
      playing?: boolean;
      subtitlesEnabled?: boolean;
    }
  | {
      type: "PIP_GLOBAL_STATE";
      pipOpen: boolean;
      sourcePlaying?: boolean;
    }
  | {
      type: "SAVE_PIP_BOUNDS";
      innerWidth: number;
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | { type: "RESTORE_PIP_BOUNDS"; innerWidth: number }
  | {
      type: "CENTER_PIP_BOUNDS";
      innerWidth: number;
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | { type: "GET_PIP_BOUNDS" }
  | { type: "PIP_SOURCE_PLAYBACK_CHANGED"; playing: boolean }
  | { type: "PIP_SUBTITLES_ENABLED_CHANGED"; enabled: boolean }
  | { type: "GET_ADDITIONAL_DANMAKU_SOURCE" }
  | {
      type: "ADDITIONAL_DANMAKU_SOURCE_STATUS";
      error: string | null;
      revision: number;
    }
  | {
      type: "ADDITIONAL_DANMAKU_SOURCE_CHANGED";
      source: { enabled: boolean; url: string; offsetSeconds: number };
      available: boolean;
    }
  | {
      type: "SET_ADDITIONAL_DANMAKU_SOURCE";
      source: { enabled: boolean; url: string; offsetSeconds: number };
    }
  | {
      type: "RESIZE_PIP_WINDOW";
      innerWidth: number;
      width: number;
      height: number;
    }
  | ({
      type: "GET_BILIBILI_DANMAKU";
      page: number;
      startSegment?: number;
      endSegment?: number;
    } & ({ bvid: string; avid?: never } | { avid: string; bvid?: never }))
  | { type: "GET_BAHAMUT_DANMAKU"; videoSn: string }
  | {
      type: "START_ADDITIONAL_TWITCH_CHAT";
      channel: string;
    }
  | { type: "STOP_ADDITIONAL_TWITCH_CHAT" }
  | {
      type: "ADDITIONAL_TWITCH_CHAT_STATUS";
      channel: string;
      connectionId: string;
      status: "connected" | "error";
      error?: string;
    }
  | {
      type: "ADDITIONAL_TWITCH_CHAT_MESSAGE";
      channel: string;
      connectionId: string;
      data: DanmakuData;
    }
  | { type: "GET_BILIBILI_SUBTITLE_CUES"; url: string }
  | { type: "GET_SUBTITLE_TRANSLATION_LANGUAGES" }
  | { type: "GET_SUBTITLE_TRANSLATION_SERVICES" }
  | {
      type: "SET_SUBTITLE_TRANSLATION_PROVIDER";
      provider: SubtitleTranslationProvider;
    }
  | {
      type: "TRANSLATE_SUBTITLE_CUES";
      targetLanguage: SubtitleTranslationLanguage;
      texts: string[];
    }
  | {
      type: "TEST_SUBTITLE_TRANSLATION";
      provider: SubtitleTranslationProvider;
      config: SubtitleTranslationConfig;
    };
