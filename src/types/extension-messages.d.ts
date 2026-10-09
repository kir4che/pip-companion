type SimpleExtensionMessageType =
  "PING" | "GET_PIP_STATE" | "OPEN_PIP" | "CLOSE_PIP" | "CLOSE_ALL_PIP";

type ExtensionMessage =
  | { type: SimpleExtensionMessageType }
  | { type: "PIP_STATE_CHANGED" | "PIP_GLOBAL_STATE"; pipOpen: boolean }
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
