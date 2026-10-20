"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuSearchPanel = {
  create(
    doc: Document,
    t: (key: string, substitutions?: string | string[]) => string,
    options: {
      makeButton(
        action: string,
        label: string,
        ariaLabel: string,
      ): HTMLButtonElement;
      onSeek(seconds: number): void;
      getMessages?(): DanmakuData[];
      loadAllMessages?(): Promise<DanmakuData[]>;
      getDuration?(): number;
      shortcutHint?: string;
      supportsHeatPeaks?: boolean | (() => boolean);
    },
  ): DanmakuSearchPanelElements {
    const formatTime =
      globalThis.PipCompanion.util?.formatTime ||
      ((s: number) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      });

    let currentMessages: DanmakuData[] = [];
    let currentResults: DanmakuSearchResult[] = [];
    let currentDuration: number | undefined;
    let activeResultIndex = -1;
    let cachedPeaks: DanmakuHeatPeak[] | null = null;
    let cachedPeaksMessageCount = -1;
    let loadStatus: "idle" | "loading" | "error" | "success" = "idle";
    const isHeatPeaksSupported = (): boolean => {
      if (typeof options.supportsHeatPeaks === "function") {
        return options.supportsHeatPeaks();
      }
      return options.supportsHeatPeaks !== false;
    };

    const toggle = options.makeButton(
      "danmaku-search-toggle",
      "",
      t("pipDanmakuSearchOpen"),
    );
    toggle.title = t("pipDanmakuSearchOpen");
    toggle.className = "danmaku-search-toggle";
    toggle.setAttribute("aria-expanded", "false");

    const icons = globalThis.PipCompanion?.icons;
    if (icons) toggle.append(icons.createSvg(doc, { path: icons.SEARCH_PATH }));

    const panel = doc.createElement("section");
    panel.id = "danmaku-search-panel";
    panel.className = "danmaku-search-panel";
    panel.setAttribute("aria-label", t("pipDanmakuSearchOpen"));
    panel.hidden = true;
    toggle.setAttribute("aria-controls", panel.id);

    const header = doc.createElement("div");
    header.className = "danmaku-search-header";

    const inputWrap = doc.createElement("div");
    inputWrap.className = "danmaku-search-input-wrap";

    const inputIcon = icons
      ? icons.createSvg(doc, {
          path: icons.SEARCH_PATH,
          className: "danmaku-search-input-icon",
        })
      : doc.createElementNS("http://www.w3.org/2000/svg", "svg");

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "danmaku-search-input";
    input.placeholder = t("pipDanmakuSearchPlaceholder");
    input.setAttribute("aria-label", t("pipDanmakuSearchOpen"));
    input.autocomplete = "off";

    const clearButton = doc.createElement("button");
    clearButton.type = "button";
    clearButton.className = "danmaku-search-clear";
    clearButton.textContent = "✕";
    clearButton.hidden = true;
    clearButton.setAttribute("aria-label", "Clear");

    inputWrap.append(inputIcon, input, clearButton);

    const closeButton = doc.createElement("button");
    closeButton.type = "button";
    closeButton.className = "danmaku-search-close";
    closeButton.textContent = "✕";
    closeButton.setAttribute("aria-label", t("pipDanmakuSearchClose"));

    header.append(inputWrap, closeButton);

    const heatSection = doc.createElement("div");
    heatSection.className = "danmaku-heat-section";

    const heatTitle = doc.createElement("div");
    heatTitle.className = "danmaku-heat-title";
    heatTitle.textContent = t("pipDanmakuHeatPeaks");

    const heatList = doc.createElement("div");
    heatList.className = "danmaku-heat-chips";

    const heatStatus = doc.createElement("div");
    heatStatus.className = "danmaku-heat-status";
    heatStatus.hidden = true;

    heatSection.append(heatTitle, heatList, heatStatus);

    const resultsSection = doc.createElement("div");
    resultsSection.className = "danmaku-results-section";
    resultsSection.hidden = true;

    const resultsCount = doc.createElement("div");
    resultsCount.className = "danmaku-results-count";
    resultsCount.hidden = true;

    const resultsList = doc.createElement("div");
    resultsList.className = "danmaku-results-list";
    resultsList.setAttribute("role", "listbox");
    resultsList.hidden = true;

    const emptyState = doc.createElement("div");
    emptyState.className = "danmaku-search-empty";
    emptyState.hidden = true;
    emptyState.textContent = t("pipDanmakuSearchEmpty");

    resultsSection.append(resultsCount, resultsList, emptyState);

    panel.append(header, heatSection, resultsSection);

    function renderHeatPeaks(): void {
      if (!isHeatPeaksSupported()) {
        heatSection.hidden = true;
        return;
      }
      heatList.replaceChildren();
      const messages = options.getMessages?.() || currentMessages;
      const duration = options.getDuration?.() ?? currentDuration;

      let peaks: DanmakuHeatPeak[];
      if (cachedPeaks && cachedPeaksMessageCount === messages.length)
        peaks = cachedPeaks;
      else {
        peaks =
          globalThis.PipCompanion.danmakuSearch?.calculateDanmakuHeatPeaks(
            messages,
            duration,
          ) || [];
        cachedPeaks = peaks;
        cachedPeaksMessageCount = messages.length;
      }

      heatSection.hidden = false;

      function showHeatStatus(key: string): void {
        heatList.hidden = true;
        heatStatus.hidden = false;
        heatStatus.textContent = t(key);
      }

      if (loadStatus === "loading" && peaks.length === 0) {
        showHeatStatus("pipDanmakuSearchLoading");
        return;
      }

      if (loadStatus === "error" && peaks.length === 0) {
        showHeatStatus("pipDanmakuSearchFailed");
        return;
      }

      if (messages.length === 0) {
        showHeatStatus("pipDanmakuSearchNoMessages");
        return;
      }

      if (peaks.length === 0) {
        showHeatStatus("pipDanmakuSearchNoPeaks");
        return;
      }

      heatStatus.hidden = true;
      heatList.hidden = false;
      peaks.forEach((peak, index) => {
        const chip = doc.createElement("button");
        chip.type = "button";
        chip.className = "danmaku-heat-chip";
        chip.dataset.rank = String(index + 1);

        const rankBadge = doc.createElement("span");
        rankBadge.className = "danmaku-heat-rank";
        rankBadge.textContent = `#${index + 1}`;

        const timeText = doc.createElement("span");
        timeText.className = "danmaku-heat-time";
        timeText.textContent = formatTime(peak.time);

        chip.append(rankBadge, timeText);

        if (peak.representativeText) {
          const repText = doc.createElement("span");
          repText.className = "danmaku-heat-text";
          repText.textContent = peak.representativeText;
          chip.append(repText);
        }

        chip.addEventListener("click", () => {
          const target = Math.max(0, peak.time - 2);
          options.onSeek(target);
          close();
        });

        heatList.append(chip);
      });
    }

    function renderResults(query: string): void {
      resultsList.replaceChildren();
      activeResultIndex = -1;

      const trimmed = query.trim();
      clearButton.hidden = trimmed.length === 0;

      if (!trimmed) {
        if (isHeatPeaksSupported()) {
          heatSection.hidden = false;
          resultsSection.hidden = true;
          resultsCount.hidden = true;
          resultsList.hidden = true;
          emptyState.hidden = true;
          currentResults = [];
          renderHeatPeaks();
        } else {
          heatSection.hidden = true;
          resultsSection.hidden = false;
          resultsCount.hidden = true;
          resultsList.hidden = true;
          emptyState.hidden = false;
          emptyState.textContent = t("pipDanmakuSearchHint");
          currentResults = [];
        }
        return;
      }

      heatSection.hidden = true;
      resultsSection.hidden = false;
      const messages = options.getMessages?.() || currentMessages;
      currentResults =
        globalThis.PipCompanion.danmakuSearch?.searchDanmaku(
          messages,
          trimmed,
        ) || [];

      if (currentResults.length === 0) {
        resultsCount.hidden = true;
        resultsList.hidden = true;
        emptyState.hidden = false;
        if (loadStatus === "loading")
          emptyState.textContent = t("pipDanmakuSearchLoading");
        else if (loadStatus === "error" && messages.length === 0)
          emptyState.textContent = t("pipDanmakuSearchFailed");
        else if (messages.length === 0)
          emptyState.textContent = t("pipDanmakuSearchNoMessages");
        else emptyState.textContent = t("pipDanmakuSearchEmpty");
        return;
      }

      emptyState.hidden = true;
      resultsCount.hidden = false;
      resultsCount.textContent = t("pipDanmakuSearchResultsCount", [
        String(currentResults.length),
      ]);
      resultsList.hidden = false;

      const qLower = trimmed.toLowerCase();

      currentResults.forEach((item, index) => {
        const row = doc.createElement("div");
        row.className = "danmaku-result-item";
        row.setAttribute("role", "option");
        row.dataset.index = String(index);

        const timeBadge = doc.createElement("span");
        timeBadge.className = "danmaku-result-time";
        timeBadge.textContent = formatTime(item.time);

        const textSpan = doc.createElement("span");
        textSpan.className = "danmaku-result-text";

        const originalText = item.text;
        const lowerText = originalText.toLowerCase();
        const matchIdx = lowerText.indexOf(qLower);

        if (matchIdx !== -1) {
          const before = originalText.slice(0, matchIdx);
          const matched = originalText.slice(
            matchIdx,
            matchIdx + trimmed.length,
          );
          const after = originalText.slice(matchIdx + trimmed.length);

          if (before) textSpan.append(doc.createTextNode(before));
          const mark = doc.createElement("mark");
          mark.className = "danmaku-result-mark";
          mark.textContent = matched;
          textSpan.append(mark);
          if (after) textSpan.append(doc.createTextNode(after));
        } else textSpan.textContent = originalText;

        row.append(timeBadge, textSpan);

        if (item.count && item.count > 1) {
          const countBadge = doc.createElement("span");
          countBadge.className = "danmaku-result-count";
          countBadge.textContent = `×${item.count}`;
          row.append(countBadge);
        }

        row.addEventListener("click", () => {
          const target = Math.max(0, item.time - 1.5);
          options.onSeek(target);
          close();
        });

        resultsList.append(row);
      });
    }

    function updateActiveResult(newIndex: number): void {
      const items = resultsList.querySelectorAll(".danmaku-result-item");
      if (items.length === 0) return;

      if (activeResultIndex >= 0 && items[activeResultIndex])
        items[activeResultIndex]?.classList.remove("is-active");

      if (newIndex < 0) {
        activeResultIndex = -1;
        return;
      }

      activeResultIndex = Math.max(0, Math.min(newIndex, items.length - 1));
      const activeEl = items[activeResultIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.classList.add("is-active");
        activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    input.addEventListener("input", () => {
      renderResults(input.value);
    });

    clearButton.addEventListener("click", () => {
      input.value = "";
      input.focus();
      renderResults("");
    });

    closeButton.addEventListener("click", () => {
      close();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        updateActiveResult(activeResultIndex + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateActiveResult(activeResultIndex - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeResultIndex >= 0 && currentResults[activeResultIndex]) {
          const item = currentResults[activeResultIndex];
          if (item) options.onSeek(Math.max(0, item.time - 1.5));
          close();
        } else if (currentResults.length > 0 && currentResults[0]) {
          options.onSeek(Math.max(0, currentResults[0].time - 1.5));
          close();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    });

    function refreshView(): void {
      if (!input.value.trim()) {
        if (isHeatPeaksSupported()) renderHeatPeaks();
        else renderResults("");
      } else renderResults(input.value);
    }

    function open(): void {
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      const loadPromise = options.loadAllMessages?.();
      if (loadPromise) {
        loadStatus = "loading";
        if (isHeatPeaksSupported()) renderHeatPeaks();
        else heatSection.hidden = true;
        renderResults(input.value);
        void loadPromise
          .then((msgs) => {
            loadStatus = "success";
            if (Array.isArray(msgs)) currentMessages = msgs;
            refreshView();
          })
          .catch(() => {
            loadStatus = "error";
            refreshView();
          });
      } else {
        if (loadStatus !== "error")
          loadStatus =
            (options.getMessages?.() || currentMessages).length > 0
              ? "success"
              : "idle";
        if (isHeatPeaksSupported()) renderHeatPeaks();
        else heatSection.hidden = true;
        renderResults(input.value);
      }
      input.focus();
      input.select();
    }

    function close(): void {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      input.blur();
    }

    function togglePanel(): void {
      if (panel.hidden) open();
      else close();
    }

    function isOpen(): boolean {
      return !panel.hidden;
    }

    function focus(): void {
      if (panel.hidden) open();
      else {
        input.focus();
        input.select();
      }
    }

    function setMessages(messages: DanmakuData[], duration?: number): void {
      if (messages !== currentMessages) {
        cachedPeaks = null;
        cachedPeaksMessageCount = -1;
      }
      currentMessages = messages;
      if (messages.length > 0 && loadStatus !== "loading")
        loadStatus = "success";
      if (typeof duration === "number") currentDuration = duration;
      if (!panel.hidden) refreshView();
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePanel();
    });

    return {
      toggle,
      panel,
      input,
      clearButton,
      closeButton,
      heatSection,
      heatList,
      heatStatus,
      resultsSection,
      resultsCount,
      resultsList,
      emptyState,
      focus,
      open,
      close,
      togglePanel,
      isOpen,
      setMessages,
    };
  },
};
