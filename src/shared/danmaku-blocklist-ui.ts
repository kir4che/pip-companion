"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuBlocklistUi = (() => {
  const blocklistApi = globalThis.PipCompanion.danmakuBlocklist;
  const STORAGE_KEY = blocklistApi.STORAGE_KEY;

  function create(
    container: HTMLElement,
    t: (key: string, substitutions?: string | string[]) => string,
    options?: DanmakuBlocklistUiOptions,
  ) {
    container.innerHTML = `
      <div class="danmaku-blocklist-manager">
        <div class="blocklist-input-group">
          <form class="blocklist-input-form" onsubmit="return false;">
            <div class="blocklist-input-wrap">
              <input
                type="text"
                class="blocklist-input"
                placeholder="${t("optionsDanmakuBlocklistPlaceholder")}"
                maxlength="100"
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="blocklist-clear-btn"
                aria-label="${t("optionsDanmakuBlocklistClear")}"
                hidden
              >✕</button>
            </div>
            <button type="submit" class="blocklist-add-btn" disabled>
              ${t("optionsDanmakuBlocklistAdd")}
            </button>
          </form>
          <div class="blocklist-input-hint">
            ${t("optionsDanmakuBlocklistHint")}
          </div>
        </div>
        <span class="blocklist-error" role="alert" hidden></span>
        <ul class="blocklist-items" role="list"></ul>
      </div>
    `;

    const form = container.querySelector<HTMLFormElement>(
      ".blocklist-input-form",
    )!;
    const input =
      container.querySelector<HTMLInputElement>(".blocklist-input")!;
    const clearBtn = container.querySelector<HTMLButtonElement>(
      ".blocklist-clear-btn",
    )!;
    const addBtn =
      container.querySelector<HTMLButtonElement>(".blocklist-add-btn")!;
    const countSpan =
      options?.countElement ??
      container.querySelector<HTMLElement>(".blocklist-count");
    const errorSpan = container.querySelector<HTMLElement>(".blocklist-error")!;
    const listEl =
      container.querySelector<HTMLUListElement>(".blocklist-items")!;

    let currentItems: string[] = [];

    function showError(msg: string) {
      errorSpan.textContent = msg;
      errorSpan.hidden = false;
    }

    function clearError() {
      errorSpan.textContent = "";
      errorSpan.hidden = true;
    }

    function syncInputState() {
      clearError();
      const hasValue = input.value.length > 0;
      clearBtn.hidden = !hasValue || input.disabled;
      addBtn.disabled =
        !input.value.trim() ||
        currentItems.length >= blocklistApi.MAX_BLOCKLIST_ITEMS;
    }

    function renderList() {
      listEl.replaceChildren();
      if (countSpan) {
        countSpan.textContent = `${currentItems.length} / ${blocklistApi.MAX_BLOCKLIST_ITEMS}`;
      }
      input.disabled = currentItems.length >= blocklistApi.MAX_BLOCKLIST_ITEMS;
      syncInputState();

      currentItems.forEach((rule, index) => {
        const li = document.createElement("li");
        li.className = "blocklist-item";

        const textSpan = document.createElement("span");
        textSpan.className = "blocklist-item-text";
        textSpan.textContent = rule;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "blocklist-delete-btn";
        delBtn.setAttribute(
          "aria-label",
          `${t("optionsDanmakuBlocklistDelete")}: ${rule}`,
        );
        delBtn.textContent = "✕";

        delBtn.addEventListener("click", () => {
          currentItems.splice(index, 1);
          saveAndRender();
        });

        li.append(textSpan, delBtn);
        listEl.append(li);
      });
    }

    function saveAndRender() {
      const normalized = blocklistApi.normalize(currentItems);
      currentItems = normalized;
      void chrome.storage.local.set({ [STORAGE_KEY]: normalized });
      renderList();
    }

    function handleAdd() {
      clearError();
      const raw = input.value.trim();
      if (!raw) return;

      if (currentItems.length >= blocklistApi.MAX_BLOCKLIST_ITEMS) {
        showError(t("optionsDanmakuBlocklistLimitReached"));
        return;
      }

      if (
        currentItems.some((item) => item.toLowerCase() === raw.toLowerCase())
      ) {
        showError(t("optionsDanmakuBlocklistDuplicate"));
        return;
      }

      currentItems.push(raw);
      input.value = "";
      syncInputState();
      saveAndRender();
      input.focus();
    }

    input.addEventListener("input", syncInputState);

    clearBtn.addEventListener("click", () => {
      input.value = "";
      syncInputState();
      input.focus();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleAdd();
    });

    function applyExample(codeEl: HTMLElement) {
      input.value = codeEl.textContent || "";
      syncInputState();
      input.focus();
    }

    container.addEventListener("mousedown", (e) => {
      const codeEl = (e.target as HTMLElement).closest<HTMLElement>(
        ".blocklist-code",
      );
      if (!codeEl) return;
      e.preventDefault();
      applyExample(codeEl);
    });

    container.addEventListener("click", (e) => {
      const codeEl = (e.target as HTMLElement).closest<HTMLElement>(
        ".blocklist-code",
      );
      if (!codeEl) return;
      applyExample(codeEl);
    });

    container.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const codeEl = (e.target as HTMLElement).closest<HTMLElement>(
        ".blocklist-code",
      );
      if (!codeEl) return;
      e.preventDefault();
      applyExample(codeEl);
    });

    function loadAndRender() {
      void chrome.storage.local.get(STORAGE_KEY, (result) => {
        currentItems = blocklistApi.normalize(result?.[STORAGE_KEY]);
        renderList();
      });
    }

    loadAndRender();

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[STORAGE_KEY]) return;
        currentItems = blocklistApi.normalize(changes[STORAGE_KEY].newValue);
        renderList();
      });
    }

    return {
      reload: loadAndRender,
    };
  }

  return { create };
})();
