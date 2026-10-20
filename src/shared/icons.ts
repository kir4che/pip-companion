"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.icons = (() => {
  const NEXT_PATH = "M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z";
  const VOLUME_PATH =
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-3-4.24v8.47a4.5 4.5 0 0 0 3-4.23z";
  const VOLUME_MUTED_PATH =
    "M3 9v6h4l5 5V4L7 9H3z M15.5 9.4 16.9 8l2.6 2.6L22.1 8l1.4 1.4-2.6 2.6 2.6 2.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6z";
  const TRANSLATION_PATH =
    "M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-11 7H8.5v-1H7v4h1.5v-1H10v1c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm9 0h-1.5v-1H16v4h1.5v-1H19v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z";
  const PLAYLIST_PATH =
    "M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h13v2H3v-2zm16.5-1.5L24 18l-4.5 3.5V14.5z";
  const SEARCH_PATH =
    "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z";
  const DANMAKU_SEND_INNER_HTML =
    '<path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16z" fill-rule="evenodd" fill="currentColor"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="16" cy="10" r="1" fill="currentColor"/>';
  const PLUS_PATH = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
  const PLAY_PATH = "M8 5v14l11-7z";
  const PAUSE_PATH = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
  const FRAME_PREV_PATH = "M14 6l-6 6 6 6V6zm-7 0l-6 6 6 6V6z";
  const FRAME_NEXT_PATH = "M4 6l6 6-6 6V6zm7 0l6 6-6 6V6z";
  const SCREENSHOT_PATH =
    "M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z";
  const FLOATING_COMMENTS_PATH =
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z";

  function createSvg(
    doc: Document,
    options: {
      viewBox?: string;
      className?: string;
      innerHTML?: string;
      path?: string;
      fill?: string;
      fillRule?: CanvasFillRule;
    },
  ): SVGSVGElement {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", options.viewBox || "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (options.className) svg.setAttribute("class", options.className);
    if (options.innerHTML) {
      svg.innerHTML = options.innerHTML;
    } else if (options.path) {
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", options.path);
      if (options.fill) path.setAttribute("fill", options.fill);
      if (options.fillRule) path.setAttribute("fill-rule", options.fillRule);
      svg.append(path);
    }
    return svg;
  }

  function getSvgHtml(
    contentOrPath: string,
    options?: {
      viewBox?: string;
      width?: number;
      height?: number;
    },
  ): string {
    const viewBox = options?.viewBox || "0 0 24 24";
    const sizeAttrs =
      options?.width && options?.height
        ? ` width="${options.width}" height="${options.height}"`
        : "";
    const inner = contentOrPath.startsWith("<")
      ? contentOrPath
      : `<path d="${contentOrPath}" fill="currentColor"/>`;
    return `<svg viewBox="${viewBox}"${sizeAttrs} aria-hidden="true">${inner}</svg>`;
  }

  return {
    NEXT_PATH,
    VOLUME_PATH,
    VOLUME_MUTED_PATH,
    TRANSLATION_PATH,
    PLAYLIST_PATH,
    SEARCH_PATH,
    DANMAKU_SEND_INNER_HTML,
    PLUS_PATH,
    PLAY_PATH,
    PAUSE_PATH,
    FRAME_PREV_PATH,
    FRAME_NEXT_PATH,
    SCREENSHOT_PATH,
    FLOATING_COMMENTS_PATH,
    createSvg,
    getSvgHtml,
  };
})();
