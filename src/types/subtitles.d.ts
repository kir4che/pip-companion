// 字幕文字片段
interface SubtitleSegment {
  text: string;
}

interface SubtitleLine {
  segments: SubtitleSegment[];
  from?: number;
  to?: number;
}

interface RenderedSubtitleLine {
  line: SubtitleLine;
  role: "primary" | "secondary";
  pairIndex: number;
}

interface TimedSubtitleCue {
  from: number;
  to: number;
  content: string;
}

interface SubtitleTrackOption {
  id: string;
  index: number;
  label: string;
  language?: string;
  selected: boolean;
}

interface SubtitleTranslationConfig {
  provider: SubtitleTranslationProvider;
  microsoftKey: string;
  microsoftRegion: string;
  googleKey: string;
  deeplKey: string;
}

interface PopupSubtitleStyleRenderingApi {
  render(options: PopupSubtitleStyleRenderingOptions): void;
}

interface PopupSubtitleStyleRenderingOptions {
  document: Document;
  variants: readonly SubtitleStyleTarget[];
  styles: Record<SubtitleStyleTarget, SubtitleStyleSettings>;
  layout: SubtitleLayoutSettings;
  subtitleSettings: SubtitleSettingsApi;
}

type ExtraBilibiliFormResult =
  | { ok: true; source: ExtraBilibiliSourceSettings }
  | {
      ok: false;
      errorField: "url" | "offset";
      url: string;
      offsetSeconds: number;
    };

interface ExtraBilibiliFormApi {
  parse(
    rawUrlValue: string,
    offsetValue: string,
    enabled: boolean,
    isValidUrl: (value: string) => boolean,
  ): ExtraBilibiliFormResult;
}

interface ExtraBilibiliSourceConfigApi {
  parse(value: unknown): ExtraBilibiliSourceSettings | null;
  hasSettings(source: ExtraBilibiliSourceSettings | null): boolean;
  resolve(
    live: ExtraBilibiliSourceSettings | null,
    stored: ExtraBilibiliSourceSettings | null,
  ): {
    restore: ExtraBilibiliSourceSettings | null;
    persist: ExtraBilibiliSourceSettings | null;
  };
  storageKey(tabId: number): string;
}

interface ExtraBilibiliSourceSettings {
  enabled: boolean;
  url: string;
  offsetSeconds: number;
}

interface SubtitleLanguageTagsApi {
  normalize(code: string): string;
  normalizeSubtitleLanguage(language: string): string;
  matchesSubtitleLanguages(left: string, right: string): boolean;
  matches(left: string, right: string): boolean;
  isValid(code: string): boolean;
}

interface DanmakuStyleRenderingApi {
  render(
    style: DanmakuStyleSettings,
    controls: readonly {
      key: keyof DanmakuStyleSettings;
      input: HTMLInputElement;
      output: HTMLOutputElement;
    }[],
    fontFamily: HTMLSelectElement,
    speedOptions: readonly { value: number; label: string }[],
  ): void;
}

type SubtitleStyleTarget = "primary" | "secondary";

interface SubtitleStyleRenderingApi {
  render(options: SubtitleStyleRenderingOptions): void;
}

interface SubtitleStyleRenderingOptions {
  activeTarget: SubtitleStyleTarget;
  styles: Record<SubtitleStyleTarget, SubtitleStyleSettings>;
  styleControls: readonly {
    key: keyof SubtitleStyleSettings;
    input: HTMLInputElement;
    output: HTMLOutputElement;
  }[];
  fontFamily: HTMLSelectElement;
  textColor: HTMLInputElement;
  edgeStyle: HTMLSelectElement;
  edgeColor: HTMLInputElement;
  edgeIntensityRow: HTMLElement;
  styleButtons: Record<SubtitleStyleTarget, HTMLButtonElement>;
  styleLoaded: boolean;
  subtitlePreview: HTMLElement;
  subtitlePreviewPrimary: HTMLElement;
  subtitlePreviewSecondary: HTMLElement;
  layout: SubtitleLayoutSettings;
  pairGap: HTMLInputElement;
  pairGapValue: HTMLOutputElement;
  letterSpacing: HTMLInputElement;
  letterSpacingValue: HTMLOutputElement;
  backgroundColor: HTMLInputElement;
  backgroundOpacity: HTMLInputElement;
  backgroundOpacityValue: HTMLOutputElement;
  position: HTMLInputElement;
  positionValue: HTMLOutputElement;
  subtitleSettings: SubtitleSettingsApi;
}

interface ShortcutSettingsApi {
  normalizeAll(
    stored: Record<string, unknown>,
    keys: ShortcutKey[],
    defaults: Record<ShortcutKey, Shortcut>,
  ): Record<ShortcutKey, Shortcut>;
  same(a: Shortcut, b: Shortcut): boolean;
}

interface SubtitleTranslationConfigApi {
  normalize(value: unknown): SubtitleTranslationConfig;
  maskApiKey(key: string): string;
  getProviderApiKey(
    config: SubtitleTranslationConfig,
    provider: SubtitleTranslationProvider,
  ): string;
  getProviderOrigins(
    provider: SubtitleTranslationProvider,
    key: string,
  ): string[];
}

interface SubtitleLineGroup {
  pairIndex: number;
  lines: RenderedSubtitleLine[];
}

interface SubtitleRenderingApi {
  render(
    subtitle: HTMLElement,
    displayLines: RenderedSubtitleLine[],
    subtitleStyle: SubtitleStyleSettings,
    secondarySubtitleStyle: SubtitleStyleSettings,
    subtitleLayout: SubtitleLayoutSettings,
  ): boolean;
}

interface SubtitleCueRequest {
  readonly trackKey: string;
  readonly cues: TimedSubtitleCue[] | null;
  readonly loadedTrack: string;
  readonly pendingTrack: string;
  reset(key?: string, resetThrottle?: boolean): void;
  request(): void;
  matches(requestId: unknown, key: unknown): boolean;
  complete(cues: TimedSubtitleCue[] | null, loaded?: boolean): void;
  retry(): void;
}

interface SubtitleRemoteRequestState {
  youtubeTracks: YouTubeSubtitleTrack[];
  lastYouTubeTrackRequest: number;
  netflixTracks: NetflixSubtitleTrack[];
  netflixPrimaryTrackKey: string;
  netflixSecondaryCueRetryTimer: number | null;
  netflixSecondaryCueRetryCount: number;
  lastNetflixTrackRequest: number;
  netflixTrackRequestId: number;
}

interface SubtitleRemoteRequests {
  readonly state: SubtitleRemoteRequestState;
  readonly youtubePrimary: SubtitleCueRequest;
  readonly youtubeSecondary: SubtitleCueRequest;
  readonly netflixSecondary: SubtitleCueRequest;
  requestYouTubeTracks(): void;
  updateYouTubePrimaryTrackKey(): string;
  requestYouTubePrimaryCues(): void;
  requestYouTubeSecondaryCues(): void;
  requestNetflixTracks(force?: boolean): void;
  requestNetflixSecondaryCues(): void;
  isNetflixSecondaryActive(): boolean;
  reset(): void;
}

interface SubtitleRemoteRequestsApi {
  create(options: {
    isYouTube: boolean;
    isNetflix: boolean;
  }): SubtitleRemoteRequests;
}

interface SubtitleClockApi {
  create(options: { isActive: () => boolean; sync: () => void }): {
    ensure(): void;
    stop(): void;
  };
}

interface NativeSubtitleModesApi {
  create(options: {
    getTracks: () => TextTrack[];
    getChangedTracks: () => Map<TextTrack, TextTrackMode> | null;
    setChangedTracks: (tracks: Map<TextTrack, TextTrackMode> | null) => void;
    resetSelection: () => void;
    getYouTubeSubtitleButton: () => HTMLElement | null;
    getInitiallyEnabled: () => boolean | null;
    clearInitiallyEnabled: () => void;
  }): {
    suppress(): void;
    disableAllExcept(excludedTrack: TextTrack | null): void;
    restore(): void;
  };
}

interface SubtitleFitControllerApi {
  create(options: { fit: (subtitle: HTMLElement) => void }): {
    observe(subtitle: HTMLElement): void;
    schedule(subtitle: HTMLElement): void;
  };
}

interface SubtitleCueDataApi {
  deduplicateLines(lines: SubtitleLine[]): SubtitleLine[];
  groupByPairIndex(lines: RenderedSubtitleLine[]): SubtitleLineGroup[];
  getRenderedSignature(
    lines: RenderedSubtitleLine[],
    subtitleStyle: SubtitleStyleSettings,
    secondarySubtitleStyle: SubtitleStyleSettings,
    subtitleLayout: SubtitleLayoutSettings,
  ): string;
  extractOverlayLines(text: string): SubtitleLine[];
  parseTimedCue(value: unknown): TimedSubtitleCue | null;
  parseYouTubeCues(value: unknown): TimedSubtitleCue[];
  getActiveLines(
    cues: TimedSubtitleCue[] | null,
    currentTime: number,
  ): SubtitleLine[];
}

interface SubtitleTrackValidationApi {
  isYouTubeTrack(value: unknown): value is YouTubeSubtitleTrack;
  isNetflixTrack(value: unknown): value is NetflixSubtitleTrack;
}

interface SubtitleTrackOptionsApi {
  nativePrimary(
    tracks: TextTrack[],
    selectedTrack: TextTrack | null,
    getId: (track: TextTrack) => string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[];
  nativeSecondary(
    tracks: TextTrack[],
    primaryTrack: TextTrack | null,
    secondaryTrack: TextTrack | null,
    getId: (track: TextTrack) => string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[];
  youtubePrimary(
    tracks: YouTubeSubtitleTrack[],
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[];
  netflixPrimary(
    tracks: NetflixSubtitleTrack[],
    selectedKey: string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[];
  youtubeSecondary(
    tracks: YouTubeSubtitleTrack[],
    secondaryKey: string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[];
  netflixSecondary(
    tracks: NetflixSubtitleTrack[],
    primaryKey: string,
    secondaryKey: string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[];
}

interface GenericSubtitleOverlayDetectionApi {
  findNode(
    doc: Document,
    getStyle: (el: Element) => CSSStyleDeclaration,
    viewportHeight: number,
  ): HTMLElement | null;
}

interface YouTubeSubtitleTrack {
  key: string;
  label: string;
  language: string;
  selected: boolean;
  canLoadCues: boolean;
}

interface NetflixSubtitleTrack {
  key: string;
  index: number;
  label: string;
  language: string;
  selected: boolean;
}

interface StandardTextTrackProvider {
  getTracks(video: HTMLVideoElement | null): TextTrack[];
  getSelectedTrack(
    video: HTMLVideoElement | null,
    preferred: TextTrack | null,
  ): TextTrack | null;
  getLines(
    video: HTMLVideoElement | null,
    selected: TextTrack | null,
  ): SubtitleLine[];
  getActiveLines(
    video: HTMLVideoElement | null,
    selected: TextTrack,
    currentTime: number,
  ): SubtitleLine[];
  getTimedCues(
    video: HTMLVideoElement | null,
    selected: TextTrack | null,
  ): TimedSubtitleCue[];
  selectTrack(
    video: HTMLVideoElement | null,
    selected: TextTrack,
    beforeChange: (track: TextTrack) => void,
  ): boolean;
}

type SubtitleFontFamily = DanmakuFontFamily;
type SubtitleEdgeStyle = "none" | "shadow" | "raised" | "depressed" | "outline";
interface SubtitleStyleSettings {
  fontFamily: SubtitleFontFamily;
  fontWeight: number;
  lineHeightScale: number;
  fontSizeScale: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  edgeStyle: SubtitleEdgeStyle;
  edgeColor: string;
  edgeIntensity: number;
  bottomOffset: number;
}

interface SubtitleLayoutSettings {
  backgroundColor: string;
  backgroundOpacity: number;
  bottomOffset: number;
  pairGap: number;
  letterSpacing: number;
}

type SubtitleExtract = (node: HTMLElement) => SubtitleLine[];
