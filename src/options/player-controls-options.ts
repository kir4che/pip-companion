"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.optionsPlayerControlsOptions = {
  create({ storage, settings, t, showStatus }) {
    const activeList = document.querySelector(
      "#player-controls-active-list",
    ) as HTMLElement;
    const hiddenList = document.querySelector(
      "#player-controls-hidden-list",
    ) as HTMLElement;
    const activeEmptyMsg = document.querySelector(
      "#player-controls-active-empty",
    ) as HTMLElement;
    const saveBtn = document.querySelector(
      "#player-controls-save",
    ) as HTMLButtonElement;
    const resetBtn = document.querySelector(
      "#player-controls-reset",
    ) as HTMLButtonElement;
    const revertBtn = document.querySelector(
      "#player-controls-revert",
    ) as HTMLButtonElement;
    const unsavedBadge = document.querySelector(
      "#player-controls-unsaved-badge",
    ) as HTMLElement;

    // 狀態追蹤
    let savedConfig: PlayerControlItemConfig[] = settings.normalize(undefined);
    let currentConfig: PlayerControlItemConfig[] =
      settings.normalize(undefined);
    let draggedItemId: PlayerControlId | null = null;

    function areConfigsEqual(
      a: PlayerControlItemConfig[],
      b: PlayerControlItemConfig[],
    ): boolean {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const itemA = a[i];
        const itemB = b[i];
        if (
          !itemA ||
          !itemB ||
          itemA.id !== itemB.id ||
          itemA.visible !== itemB.visible
        )
          return false;
      }
      return true;
    }

    function updateUnsavedState() {
      const isDirty = !areConfigsEqual(currentConfig, savedConfig);
      if (unsavedBadge) unsavedBadge.hidden = !isDirty;
      if (revertBtn) revertBtn.disabled = !isDirty;
      if (saveBtn) saveBtn.classList.toggle("btn-dirty", isDirty);
    }

    function cloneConfig(
      cfg: readonly PlayerControlItemConfig[],
    ): PlayerControlItemConfig[] {
      return cfg.map((item) => ({ ...item }));
    }

    const CONTROL_BODIES: Record<PlayerControlId, string> = {
      play: `<div class="mock-pip-btn" aria-hidden="true"><span>▶</span></div>`,
      "danmaku-send": `<div class="mock-pip-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16z" fill-rule="evenodd" fill="currentColor"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="16" cy="10" r="1" fill="currentColor"/></svg></div>`,
      next: `<div class="mock-pip-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 18 14.5 12 6 6v12zm10-12v12h2V6h-2z" fill="currentColor"/></svg></div>`,
      time: `<span class="mock-pip-time" aria-hidden="true"><input type="text" class="time-current" value="0:00" size="4" readonly tabindex="-1" /><span class="time-duration">/ 0:00</span></span>`,
      progress: `<div class="mock-pip-progress-static" aria-hidden="true"><div class="mock-pip-progress-track"><div class="mock-pip-progress-fill"></div><div class="mock-pip-progress-thumb"></div></div></div>`,
      volume: `<div class="mock-pip-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/></svg></div>`,
      speed: `<div class="mock-pip-btn mock-pip-btn-speed" aria-hidden="true"><span>1×</span></div>`,
      translation: `<div class="mock-pip-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-11 7H8.5v-1H7v4h1.5v-1H10v1c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm9 0h-1.5v-1H16v4h1.5v-1H19v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z" fill="currentColor"/></svg></div>`,
      playlist: `<div class="mock-pip-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h13v2H3v-2zm16.5-1.5L24 18l-4.5 3.5V14.5z" fill="currentColor"/></svg></div>`,
      "danmaku-search": `<div class="mock-pip-btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/></svg></div>`,
    };

    function getPipControlBodyHtml(id: PlayerControlId): string {
      return CONTROL_BODIES[id] || "";
    }

    // 建立播放列控制項元件
    function createActivePipControl(
      item: PlayerControlItemConfig,
    ): HTMLElement {
      const el = document.createElement("div");
      el.className = `mock-pip-slot slot-${item.id}`;
      el.dataset.id = item.id;
      el.draggable = true;

      const title = settings.getItemName(item.id, t);
      el.setAttribute("aria-label", title);

      const bodyWrapper = document.createElement("div");
      bodyWrapper.className = "mock-pip-slot-body";
      bodyWrapper.innerHTML = getPipControlBodyHtml(item.id);

      const tooltip = document.createElement("span");
      tooltip.className = "mock-pip-slot-tooltip";
      tooltip.textContent = title;

      el.append(tooltip, bodyWrapper);
      bindDragEvents(el, item.id);

      return el;
    }

    // 建立已隱藏項目卡片元件
    function createHiddenPipControl(
      item: PlayerControlItemConfig,
    ): HTMLElement {
      const el = document.createElement("div");
      el.className = `mock-hidden-item hidden-${item.id}`;
      el.dataset.id = item.id;
      el.draggable = true;

      const title = settings.getItemName(item.id, t);
      el.title = title;

      const iconWrap = document.createElement("div");
      iconWrap.className = "hidden-item-icon";
      iconWrap.innerHTML = getPipControlBodyHtml(item.id);

      const label = document.createElement("span");
      label.className = "hidden-item-label";
      label.textContent = title;

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "hidden-item-add-btn";
      addBtn.title = t("optionsPlayerControlsShowItem");
      addBtn.setAttribute("aria-label", t("optionsPlayerControlsShowItem"));
      addBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/></svg>`;
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveItemToVisibility(item.id, true);
      });

      el.append(iconWrap, label, addBtn);
      bindDragEvents(el, item.id);

      return el;
    }

    // 建立純圖示拖曳浮影（避免文字標籤遮擋放置位置）
    function setupDragGhost(e: DragEvent, id: PlayerControlId) {
      if (!e.dataTransfer?.setDragImage || !document.body) return;

      const ghost = document.createElement("div");
      ghost.className = "pip-drag-ghost";

      const icon = document.createElement("div");
      icon.className = "pip-drag-ghost-icon";
      icon.innerHTML = getPipControlBodyHtml(id);

      ghost.append(icon);
      document.body.appendChild(ghost);

      const rect = ghost.getBoundingClientRect
        ? ghost.getBoundingClientRect()
        : { width: 34, height: 34 };
      const offsetX = rect.width > 0 ? rect.width / 2 : 17;
      const offsetY = rect.height > 0 ? rect.height / 2 : 17;
      e.dataTransfer.setDragImage(ghost, offsetX, offsetY);

      setTimeout(() => {
        if (ghost.remove) ghost.remove();
        else ghost.parentNode?.removeChild?.(ghost);
      }, 0);
    }

    function bindDragEvents(el: HTMLElement, id: PlayerControlId) {
      el.addEventListener("dragstart", (e) => {
        e.stopPropagation();
        draggedItemId = id;
        document.body?.classList.add("is-dragging-active");
        setTimeout(() => el.classList.add("is-dragging"), 0);
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
          setupDragGhost(e, id);
        }
      });

      el.addEventListener("dragend", () => {
        el.classList.remove("is-dragging");
        document.body?.classList.remove("is-dragging-active");
        draggedItemId = null;
        document
          .querySelectorAll(".mock-pip-slot, .mock-hidden-item")
          .forEach((itemEl) => {
            itemEl.classList.remove("drag-over-before", "drag-over-after");
          });
      });

      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!draggedItemId || draggedItemId === id) return;
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

        document
          .querySelectorAll(
            ".mock-pip-slot.drag-over-before, .mock-pip-slot.drag-over-after, .mock-hidden-item.drag-over-before, .mock-hidden-item.drag-over-after",
          )
          .forEach((other) => {
            if (other !== el)
              other.classList.remove("drag-over-before", "drag-over-after");
          });

        const rect = el.getBoundingClientRect();
        const isAfter = e.clientX > rect.left + rect.width / 2;
        el.classList.toggle("drag-over-after", isAfter);
        el.classList.toggle("drag-over-before", !isAfter);
      });

      el.addEventListener("dragleave", (e) => {
        if (!el.contains(e.relatedTarget as Node))
          el.classList.remove("drag-over-before", "drag-over-after");
      });

      el.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove("drag-over-before", "drag-over-after");

        if (!draggedItemId || draggedItemId === id) return;

        const rect = el.getBoundingClientRect();
        const isAfter = e.clientX > rect.left + rect.width / 2;

        handleDropOnItem(draggedItemId, id, isAfter);
      });
    }

    // 項目間拖曳換位
    function handleDropOnItem(
      sourceId: PlayerControlId,
      targetId: PlayerControlId,
      insertAfter: boolean,
    ) {
      const sourceIndex = currentConfig.findIndex((i) => i.id === sourceId);
      const targetIndex = currentConfig.findIndex((i) => i.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      const targetItem = currentConfig[targetIndex];
      const sourceItem = currentConfig[sourceIndex];
      if (!targetItem || !sourceItem) return;

      currentConfig.splice(sourceIndex, 1);
      sourceItem.visible = targetItem.visible;

      const newTargetIndex = currentConfig.findIndex((i) => i.id === targetId);
      const insertIndex = insertAfter ? newTargetIndex + 1 : newTargetIndex;

      currentConfig.splice(insertIndex, 0, sourceItem);

      render();
      updateUnsavedState();
    }

    function getDefaultRank(targetId: PlayerControlId): number {
      const rank = settings.CONTROL_IDS.indexOf(targetId);
      return rank !== -1 ? rank : 999;
    }

    // 依預設相對位置插回播放列
    function addActiveItemAtDefaultPosition(item: PlayerControlItemConfig) {
      const itemRank = getDefaultRank(item.id);
      let insertIndex = -1;

      for (let i = 0; i < currentConfig.length; i++) {
        const cfg = currentConfig[i];
        if (cfg?.visible && getDefaultRank(cfg.id) > itemRank) {
          insertIndex = i;
          break;
        }
      }

      if (insertIndex === -1) {
        let lastVisibleIndex = -1;
        for (let i = 0; i < currentConfig.length; i++) {
          const cfg = currentConfig[i];
          if (cfg?.visible) lastVisibleIndex = i;
        }
        insertIndex = lastVisibleIndex + 1;
      }

      currentConfig.splice(insertIndex, 0, item);
    }

    // 切換控制項顯示/隱藏狀態
    function moveItemToVisibility(id: PlayerControlId, visible: boolean) {
      const index = currentConfig.findIndex((i) => i.id === id);
      if (index === -1) return;

      const removed = currentConfig.splice(index, 1);
      const item = removed[0];
      if (!item) return;

      item.visible = visible;
      if (visible) addActiveItemAtDefaultPosition(item);
      else currentConfig.push(item);

      render();
      updateUnsavedState();
    }

    // 綁定跨容器拖放（播放列與隱藏池）
    function setupContainerDrop(
      container: HTMLElement,
      targetVisible: boolean,
    ) {
      container.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        const currentItem = currentConfig.find((i) => i.id === draggedItemId);
        if (currentItem && currentItem.visible !== targetVisible)
          container.classList.add("container-drag-over");
      });

      container.addEventListener("dragleave", (e) => {
        if (!container.contains(e.relatedTarget as Node))
          container.classList.remove("container-drag-over");
      });

      container.addEventListener("drop", (e) => {
        e.preventDefault();
        container.classList.remove("container-drag-over");
        if (!draggedItemId) return;

        moveItemToVisibility(draggedItemId, targetVisible);
      });
    }

    setupContainerDrop(activeList, true);
    if (activeEmptyMsg) setupContainerDrop(activeEmptyMsg, true);
    setupContainerDrop(hiddenList, false);

    saveBtn?.addEventListener("click", async () => {
      try {
        saveBtn.disabled = true;
        await storage.set({ [settings.STORAGE_KEY]: currentConfig });
        savedConfig = cloneConfig(currentConfig);
        updateUnsavedState();
        showStatus(t("optionsPlayerControlsSaved"));
      } catch {
        showStatus(t("popupCannotSaveToggle"), true);
      } finally {
        saveBtn.disabled = false;
      }
    });

    resetBtn?.addEventListener("click", () => {
      currentConfig = cloneConfig(settings.DEFAULT_CONTROLS_CONFIG);
      render();
      updateUnsavedState();
    });

    revertBtn?.addEventListener("click", () => {
      currentConfig = cloneConfig(savedConfig);
      render();
      updateUnsavedState();
    });

    function render() {
      const activeItems = currentConfig.filter((i) => i.visible);
      const hiddenItems = currentConfig.filter((i) => !i.visible);

      activeList.replaceChildren();
      hiddenList.replaceChildren();

      if (activeItems.length === 0) activeEmptyMsg.hidden = false;
      else {
        activeEmptyMsg.hidden = true;
        for (const item of activeItems)
          activeList.append(createActivePipControl(item));
      }

      for (const item of hiddenItems)
        hiddenList.append(createHiddenPipControl(item));

      updateUnsavedState();
    }

    async function load() {
      try {
        const stored = await storage.get(settings.STORAGE_KEY);
        savedConfig = settings.normalize(stored[settings.STORAGE_KEY]);
        currentConfig = cloneConfig(savedConfig);
      } catch {
        savedConfig = settings.normalize(undefined);
        currentConfig = cloneConfig(savedConfig);
      }
      render();
    }

    function handleStorageChange(
      change: chrome.storage.StorageChange | undefined,
    ) {
      if (!change) return;
      savedConfig = settings.normalize(change.newValue);
      if (areConfigsEqual(currentConfig, savedConfig)) {
        currentConfig = cloneConfig(savedConfig);
        render();
      } else updateUnsavedState();
    }

    return {
      load,
      render,
      handleStorageChange,
    };
  },
};
