"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.pipPlaylistPanel = {
  create(options) {
    const render = () => {
      const playlist = options.getPlaylist();
      options.panel.replaceChildren();
      if (!playlist || playlist.items.length < 2) {
        options.button.hidden = true;
        options.close();
        return;
      }
      const currentEntry = globalThis.PipCompanion.playlistRendering.render(
        options.document,
        options.panel,
        playlist.items,
        playlist.currentIndex,
        playlist.currentIndexKnown,
        (i) => {
          options.selectItem(i);
          options.close();
          options.button.focus();
        },
      );
      options.panel.hidden = false;
      options.button.setAttribute("aria-expanded", "true");
      if (currentEntry)
        options.window.requestAnimationFrame(() => {
          const panelRect = options.panel.getBoundingClientRect();
          const entryRect = currentEntry.getBoundingClientRect();
          if (!entryRect || options.panel.clientHeight === 0) return;
          options.panel.scrollTop +=
            entryRect.top -
            panelRect.top -
            (options.panel.clientHeight - currentEntry.clientHeight) / 2;
        });
    };

    options.eventScope.listen(options.button, "click", () => {
      if (options.panel.hidden) render();
      else options.close();
    });
    return { render };
  },
};
