"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleCueData = {
  parseTimedCue(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return null;
    const cue = value as Record<string, unknown>;
    if (
      typeof cue.from !== "number" ||
      typeof cue.to !== "number" ||
      cue.to <= cue.from ||
      typeof cue.content !== "string"
    )
      return null;
    return { from: cue.from, to: cue.to, content: cue.content };
  },
  parseYouTubeCues(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 5000).flatMap((value) => {
      const cue = this.parseTimedCue(value);
      return cue &&
        Number.isFinite(cue.from) &&
        Number.isFinite(cue.to) &&
        cue.content.length <= 10000
        ? [cue]
        : [];
    });
  },
  deduplicateLines(lines) {
    const seen = new Set<string>();
    return lines.filter((line, i) => {
      const text = line.segments
        .map((segment) => segment.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .normalize("NFC")
        .toLowerCase();
      const timing =
        line.from !== undefined || line.to !== undefined
          ? `${line.from ?? ""}\u0000${line.to ?? ""}`
          : `untimed\u0000${i}`;
      const key = `${timing}\u0000${text}`;
      if (!text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
  groupByPairIndex(lines) {
    const groups: SubtitleLineGroup[] = [];
    for (const line of lines) {
      let group = groups.find(
        (candidate) => candidate.pairIndex === line.pairIndex,
      );
      if (!group) {
        group = { pairIndex: line.pairIndex, lines: [] };
        groups.push(group);
      }
      group.lines.push(line);
    }
    return groups;
  },
  getRenderedSignature(
    lines,
    subtitleStyle,
    secondarySubtitleStyle,
    subtitleLayout,
  ) {
    return JSON.stringify({
      lines: lines.map((displayLine) => ({
        pairIndex: displayLine.pairIndex,
        role: displayLine.role,
        from: displayLine.line.from ?? null,
        to: displayLine.line.to ?? null,
        segments: displayLine.line.segments.map((segment) =>
          segment.text.replace(/\r?\n/g, " "),
        ),
      })),
      subtitleStyle,
      secondarySubtitleStyle,
      subtitleLayout,
    });
  },
  extractOverlayLines(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text) => ({ segments: [{ text }] }));
  },
  getActiveLines(cues, currentTime) {
    return (cues ?? [])
      .filter((cue) => cue.from <= currentTime && currentTime < cue.to)
      .flatMap((cue) => {
        const text = cue.content.replace(/\r?\n/g, " ").trim();
        return text
          ? [{ segments: [{ text }], from: cue.from, to: cue.to }]
          : [];
      });
  },
};
