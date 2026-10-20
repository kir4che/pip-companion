"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleRendering = {
  render(
    subtitle: HTMLElement,
    displayLines: RenderedSubtitleLine[],
    subtitleStyle: SubtitleStyleSettings,
    secondarySubtitleStyle: SubtitleStyleSettings,
    subtitleLayout: SubtitleLayoutSettings,
  ): boolean {
    if (!displayLines.length) {
      if (!subtitle.hidden) subtitle.replaceChildren();
      subtitle.hidden = true;
      return false;
    }

    globalThis.PipCompanion.subtitleSettings.apply(subtitle, subtitleStyle);
    globalThis.PipCompanion.subtitleSettings.applyLayout(
      subtitle,
      subtitleLayout,
    );
    subtitle.hidden = false;
    const doc = subtitle.ownerDocument;
    const groups =
      globalThis.PipCompanion.subtitleCueData.groupByPairIndex(displayLines);
    const pairElements = Array.from(subtitle.children).filter(
      (el): el is HTMLDivElement =>
        el instanceof doc.defaultView!.HTMLElement &&
        el.classList.contains("subtitle-pair"),
    );
    while (pairElements.length < groups.length) {
      const pairEl = doc.createElement("div");
      pairEl.className = "subtitle-pair";
      subtitle.appendChild(pairEl);
      pairElements.push(pairEl);
    }
    while (pairElements.length > groups.length) pairElements.pop()?.remove();

    for (const [groupIndex, group] of groups.entries()) {
      const pairEl = pairElements[groupIndex]!;
      const lineElements = Array.from(pairEl.children).filter(
        (el): el is HTMLDivElement =>
          el instanceof doc.defaultView!.HTMLElement &&
          el.classList.contains("subtitle-line"),
      );
      while (lineElements.length < group.lines.length) {
        const lineEl = doc.createElement("div");
        lineEl.className = "subtitle-line";
        pairEl.appendChild(lineEl);
        lineElements.push(lineEl);
      }
      while (lineElements.length > group.lines.length)
        lineElements.pop()?.remove();
      for (const [lineIndex, displayLine] of group.lines.entries()) {
        const lineEl = lineElements[lineIndex]!;
        globalThis.PipCompanion.subtitleSettings.apply(
          lineEl,
          displayLine.role === "secondary"
            ? secondarySubtitleStyle
            : subtitleStyle,
        );
        const segments = displayLine.line.segments;
        while (lineEl.children.length > segments.length)
          lineEl.lastElementChild?.remove();
        for (const [segmentIndex, segment] of segments.entries()) {
          let segmentEl = lineEl.children[segmentIndex] as
            HTMLElement | undefined;
          if (!segmentEl) {
            segmentEl = doc.createElement("span");
            segmentEl.className = "subtitle-segment";
            lineEl.appendChild(segmentEl);
          }
          segmentEl.textContent = segment.text.replace(/\r?\n/g, " ");
        }
      }
    }
    return true;
  },
};
