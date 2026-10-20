"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.genericSubtitleOverlayDetection = {
  findNode(
    doc: Document,
    getStyle: (el: Element) => CSSStyleDeclaration,
    viewportHeight: number,
  ): HTMLElement | null {
    const selector =
      '[class*="subtitle" i], [class*="caption" i], [class*="timedtext" i], [class*="text-track-display" i], [id*="subtitle" i], [id*="caption" i]';
    const scored: { element: HTMLElement; score: number; hasText: boolean }[] =
      [];
    for (const element of doc.querySelectorAll<HTMLElement>(selector)) {
      const text = (element.innerText || "").trim();
      if (text.length > 300) continue;
      if (element.querySelector("button, a, input, select, video")) continue;
      const style = getStyle(element);
      if (style.position !== "absolute" && style.position !== "fixed") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40) continue;
      if (rect.bottom < 0 || rect.top > viewportHeight) continue;
      let score = 0;
      if (style.pointerEvents === "none") score += 2;
      if (
        element.closest(
          "button, [role='button'], [role='menu'], [role='listbox']",
        )
      )
        score -= 2;
      if (
        element.closest(
          "[class*='control' i], [class*='ctrl' i], [class*='panel' i]",
        )
      )
        score -= 2;
      scored.push({ element, score, hasText: Boolean(text) });
    }

    if (!scored.length) return null;
    const populated = scored.filter((entry) => entry.hasText);
    const candidates = populated.length ? populated : scored;
    const best = Math.max(...candidates.map((entry) => entry.score));
    const top = candidates
      .filter((entry) => entry.score === best)
      .map((entry) => entry.element);
    return (
      top.find(
        (el) => !top.some((other) => other !== el && other.contains(el)),
      ) ??
      top[0] ??
      null
    );
  },
};
