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
  | { type: "PIP_STATE_CHANGED"; pipOpen: boolean; playing?: boolean }
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
  | { type: "GET_PIP_BOUNDS" }
  | { type: "PIP_SOURCE_PLAYBACK_CHANGED"; playing: boolean }
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
    } & ({ bvid: string; avid?: never } | { avid: string; bvid?: never }));
