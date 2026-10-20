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
    const saveBtn = (document.querySelector("#appearance-save") ||
      document.querySelector("#player-controls-save")) as HTMLButtonElement;
    const resetBtn = (document.querySelector("#appearance-reset") ||
      document.querySelector("#player-controls-reset")) as HTMLButtonElement;
    const revertBtn = (document.querySelector("#appearance-revert") ||
      document.querySelector("#player-controls-revert")) as HTMLButtonElement;
    const unsavedBadge = (document.querySelector("#appearance-unsaved-badge") ||
      document.querySelector("#player-controls-unsaved-badge")) as HTMLElement;

    const mockPipWindow = document.querySelector(
      "#mock-pip-window, .mock-pip-window",
    ) as HTMLElement;
    const presetsContainer = document.querySelector(
      "#theme-color-presets",
    ) as HTMLElement;
    const customColorInput = document.querySelector(
      "#theme-color-custom-input",
    ) as HTMLInputElement;
    const customSwatch = document.querySelector(
      "#theme-color-custom-swatch",
    ) as HTMLElement;
    const customPickerWrap = document.querySelector(
      ".theme-custom-picker",
    ) as HTMLElement;

    // 狀態追蹤
    let savedConfig: PlayerControlItemConfig[] = settings.normalize(undefined);
    let currentConfig: PlayerControlItemConfig[] =
      settings.normalize(undefined);
    let savedColor: string = settings.normalizeThemeColor(undefined);
    let currentColor: string = settings.normalizeThemeColor(undefined);
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
      const isConfigDirty = !areConfigsEqual(currentConfig, savedConfig);
      const isColorDirty =
        currentColor.toLowerCase() !== savedColor.toLowerCase();
      const isDirty = isConfigDirty || isColorDirty;
      if (unsavedBadge) unsavedBadge.hidden = !isDirty;
      if (revertBtn) revertBtn.disabled = !isDirty;
      if (saveBtn) {
        saveBtn.hidden = !isDirty;
        saveBtn.classList.toggle("btn-dirty", isDirty);
      }
    }

    function applyThemeColor(color: string) {
      if (mockPipWindow?.style)
        mockPipWindow.style.setProperty("--pip-accent", color);
      if (customColorInput) customColorInput.value = color;
      if (customSwatch?.style) customSwatch.style.backgroundColor = color;

      if (presetsContainer) {
        const presetButtons =
          presetsContainer.querySelectorAll(".theme-preset-btn");
        let matchedPreset = false;
        presetButtons.forEach((btn) => {
          const btnColor = (btn as HTMLElement).dataset.color || "";
          const isActive = btnColor.toLowerCase() === color.toLowerCase();
          btn.classList.toggle("is-active", isActive);
          btn.setAttribute("aria-checked", String(isActive));
          if (isActive) matchedPreset = true;
        });
        if (customPickerWrap)
          customPickerWrap.classList.toggle("is-active", !matchedPreset);
      }
    }

    function renderThemePresets() {
      if (!presetsContainer || presetsContainer.children.length > 0) return;
      for (const preset of settings.PRESET_THEME_COLORS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-preset-btn";
        btn.dataset.color = preset.color;
        btn.style.setProperty("--preset-color", preset.color);
        btn.title = preset.color;
        btn.setAttribute("aria-label", preset.color);
        btn.setAttribute("role", "radio");
        btn.addEventListener("click", () => {
          currentColor = settings.normalizeThemeColor(preset.color);
          applyThemeColor(currentColor);
          updateUnsavedState();
        });
        presetsContainer.append(btn);
      }

      if (customColorInput) {
        customColorInput.addEventListener("input", () => {
          currentColor = settings.normalizeThemeColor(customColorInput.value);
          applyThemeColor(currentColor);
          updateUnsavedState();
        });
      }
    }

    function cloneConfig(
      cfg: readonly PlayerControlItemConfig[],
    ): PlayerControlItemConfig[] {
      return cfg.map((item) => ({ ...item }));
    }

    const icons = globalThis.PipCompanion?.icons;
    const getIconSvg = (
      pathOrHtml?: string,
      opts?: { width?: number; height?: number },
    ) => (icons ? icons.getSvgHtml(pathOrHtml || "", opts) : "");
    const CONTROL_BODIES: Record<PlayerControlId, string> = {
      play: `<div class="mock-pip-btn" aria-hidden="true"><span>▶</span></div>`,
      "danmaku-send": `<div class="mock-pip-btn" aria-hidden="true">${getIconSvg(icons?.DANMAKU_SEND_INNER_HTML)}</div>`,
      next: `<div class="mock-pip-btn" aria-hidden="true">${getIconSvg(icons?.NEXT_PATH)}</div>`,
      time: `<span class="mock-pip-time" aria-hidden="true"><input type="text" class="time-current" value="0:00" size="4" readonly tabindex="-1" /><span class="time-duration">/ 0:00</span></span>`,
      progress: `<div class="mock-pip-progress-static" aria-hidden="true"><div class="mock-pip-progress-track"><div class="mock-pip-progress-fill"></div><div class="mock-pip-progress-thumb"></div></div></div>`,
      volume: `<div class="mock-pip-btn" aria-hidden="true">${getIconSvg(icons?.VOLUME_PATH)}</div>`,
      speed: `<div class="mock-pip-btn mock-pip-btn-speed" aria-hidden="true"><span>1×</span></div>`,
      translation: `<div class="mock-pip-btn" aria-hidden="true">${getIconSvg(icons?.TRANSLATION_PATH)}</div>`,
      playlist: `<div class="mock-pip-btn" aria-hidden="true">${getIconSvg(icons?.PLAYLIST_PATH)}</div>`,
      "danmaku-search": `<div class="mock-pip-btn" aria-hidden="true">${getIconSvg(icons?.SEARCH_PATH)}</div>`,
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
      addBtn.innerHTML = getIconSvg(icons?.PLUS_PATH, {
        width: 14,
        height: 14,
      });
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
        await storage.set({
          [settings.STORAGE_KEY]: currentConfig,
          [settings.THEME_STORAGE_KEY]: currentColor,
        });
        savedConfig = cloneConfig(currentConfig);
        savedColor = currentColor;
        updateUnsavedState();
        showStatus(
          t("optionsAppearanceSaved") || t("optionsPlayerControlsSaved"),
        );
      } catch {
        showStatus(t("popupCannotSaveToggle"), true);
      } finally {
        saveBtn.disabled = false;
      }
    });

    resetBtn?.addEventListener("click", () => {
      currentConfig = cloneConfig(settings.DEFAULT_CONTROLS_CONFIG);
      currentColor = settings.DEFAULT_THEME_COLOR;
      render();
      applyThemeColor(currentColor);
      updateUnsavedState();
    });

    revertBtn?.addEventListener("click", () => {
      currentConfig = cloneConfig(savedConfig);
      currentColor = savedColor;
      render();
      applyThemeColor(currentColor);
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
        const storedTheme = await storage.get(settings.THEME_STORAGE_KEY);
        savedConfig = settings.normalize(stored[settings.STORAGE_KEY]);
        currentConfig = cloneConfig(savedConfig);
        savedColor = settings.normalizeThemeColor(
          storedTheme[settings.THEME_STORAGE_KEY],
        );
        currentColor = savedColor;
      } catch {
        savedConfig = settings.normalize(undefined);
        currentConfig = cloneConfig(savedConfig);
        savedColor = settings.normalizeThemeColor(undefined);
        currentColor = savedColor;
      }
      renderThemePresets();
      render();
      applyThemeColor(currentColor);
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

    function handleThemeStorageChange(
      change: chrome.storage.StorageChange | undefined,
    ) {
      if (!change) return;
      savedColor = settings.normalizeThemeColor(change.newValue);
      if (currentColor.toLowerCase() === savedColor.toLowerCase()) {
        currentColor = savedColor;
        applyThemeColor(currentColor);
      } else updateUnsavedState();
    }

    return {
      load,
      render,
      handleStorageChange,
      handleThemeStorageChange,
    };
  },
};
