"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.playlistRendering = {
  render(doc, panel, items, currentIndex, currentIndexKnown, onSelect) {
    panel.replaceChildren();
    let currentEntry: HTMLButtonElement | null = null;
    for (const item of items) {
      const entry = doc.createElement("button");
      entry.type = "button";
      entry.className = "playlist-item";
      if (currentIndexKnown && item.index === currentIndex) {
        entry.classList.add("current");
        entry.setAttribute("aria-current", "true");
        currentEntry = entry;
      }
      entry.setAttribute(
        "aria-label",
        `${item.index + 1}. ${item.title}${item.duration ? `, ${item.duration}` : ""}`,
      );
      const index = doc.createElement("span");
      index.className = "playlist-index";
      index.textContent = String(item.index + 1).padStart(2, "0");
      const title = doc.createElement("span");
      title.className = "playlist-title";
      title.textContent = item.title;
      entry.append(index, title);
      if (item.duration) {
        const duration = doc.createElement("span");
        duration.className = "playlist-duration";
        duration.textContent = item.duration;
        entry.append(duration);
      }
      entry.addEventListener("click", () => onSelect(item.index));
      panel.append(entry);
    }
    return currentEntry;
  },
};
