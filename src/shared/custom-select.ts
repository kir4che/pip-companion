"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.customSelect = (() => {
  interface Controller {
    wrapper: HTMLDivElement;
    trigger: HTMLButtonElement;
    menu: HTMLDivElement;
    close(): void;
    dispose(): void;
  }

  let nextId = 0;
  const controllers = new Set<Controller>();
  const enhanced = new WeakMap<HTMLSelectElement, Controller>();

  function enhance(select: HTMLSelectElement) {
    if (enhanced.has(select) || !select.parentNode) return;

    const doc = select.ownerDocument;
    const win = doc.defaultView;
    if (!win || !doc.body) return;

    const wrapper = doc.createElement("div");
    wrapper.className = `custom-select ${Array.from(select.classList).join(" ")}`;
    wrapper.dataset.customSelect = "true";
    wrapper.id = `custom-select-${++nextId}`;

    const trigger = doc.createElement("button");
    trigger.type = "button";
    trigger.id = `${wrapper.id}-trigger`;
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", `${wrapper.id}-listbox`);
    const labelledBy = select.getAttribute("aria-labelledby");
    const explicitLabel = select.getAttribute("aria-label");
    const sourceLabels = Array.from(select.labels ?? []);
    const sourceParent = select.parentNode;
    const sourceNextSibling = select.nextSibling;
    const sourceTabIndex = select.getAttribute("tabindex");
    const sourceAriaHidden = select.getAttribute("aria-hidden");
    const sourceLabelFor = new Map(
      sourceLabels.map((label) => [label, label.htmlFor]),
    );
    const sourceLabel = sourceLabels[0];
    const getLabelText = () => {
      if (!sourceLabel) return "";
      const clone = sourceLabel.cloneNode(true) as HTMLLabelElement;
      for (const control of clone.querySelectorAll(".custom-select, select"))
        control.remove();
      return clone.textContent?.trim() || "";
    };
    if (labelledBy) trigger.setAttribute("aria-labelledby", labelledBy);
    else if (explicitLabel) trigger.setAttribute("aria-label", explicitLabel);
    else
      trigger.setAttribute("aria-label", getLabelText() || "Select an option");
    if (select.title) trigger.title = select.title;

    const value = doc.createElement("span");
    value.className = "custom-select-value";
    const chevron = doc.createElement("span");
    chevron.className = "custom-select-chevron";
    chevron.setAttribute("aria-hidden", "true");
    trigger.append(value, chevron);

    const menu = doc.createElement("div");
    menu.id = `${wrapper.id}-listbox`;
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-labelledby", trigger.id);
    menu.hidden = true;

    select.classList.add("custom-select-source");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(trigger);
    for (const label of sourceLabels) label.htmlFor = trigger.id;
    doc.body.append(select, menu);

    let activeIndex = -1;
    let typeahead = "";
    let typeaheadTimer = 0;

    const controller: Controller = {
      wrapper,
      trigger,
      menu,
      close: () => {},
      dispose: () => {},
    };
    const listenerController = new win.AbortController();
    let labelObserver: MutationObserver | null = null;

    const enabledOptionButtons = () =>
      Array.from(
        menu.querySelectorAll<HTMLButtonElement>("[role='option']"),
      ).filter((option) => !option.disabled);

    const setActiveOption = (i: number) => {
      const options = enabledOptionButtons();
      if (!options.length) {
        activeIndex = -1;
        trigger.removeAttribute("aria-activedescendant");
        return;
      }
      activeIndex = (i + options.length) % options.length;
      for (const [optionIndex, option] of options.entries())
        option.classList.toggle("is-active", optionIndex === activeIndex);
      const active = options[activeIndex];
      if (active) {
        trigger.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      }
    };

    const positionMenu = () => {
      if (menu.hidden) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 5;
      const menuWidth = Math.min(
        Math.max(rect.width, 170),
        win.innerWidth - margin * 2,
      );
      const maxHeight = Math.min(260, Math.max(80, win.innerHeight * 0.55));
      menu.style.maxHeight = `${maxHeight}px`;
      menu.style.minWidth = `${menuWidth}px`;
      menu.style.width = `${menuWidth}px`;
      const below = win.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const placeAbove =
        below < Math.min(menu.scrollHeight, maxHeight) && above > below;
      const available = Math.max(
        80,
        Math.min(maxHeight, placeAbove ? above : below),
      );
      menu.style.maxHeight = `${available}px`;
      const menuHeight = menu.getBoundingClientRect().height;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, win.innerWidth - menuWidth - margin),
      );
      const top = placeAbove
        ? Math.max(margin, rect.top - menuHeight - gap)
        : Math.min(win.innerHeight - menuHeight - margin, rect.bottom + gap);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.classList.toggle("opens-up", placeAbove);
    };

    const close = () => {
      menu.hidden = true;
      wrapper.dataset.open = "false";
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
    };

    const open = () => {
      for (const other of controllers) other.close();
      menu.hidden = false;
      wrapper.dataset.open = "true";
      trigger.setAttribute("aria-expanded", "true");
      positionMenu();
      const options = enabledOptionButtons();
      const selectedIndex = options.findIndex(
        (option) => option.dataset.value === select.value,
      );
      setActiveOption(selectedIndex >= 0 ? selectedIndex : 0);
    };

    const syncValue = () => {
      const selected = select.selectedOptions[0];
      value.textContent =
        selected?.label || selected?.textContent?.trim() || "";
      trigger.disabled = select.disabled;
      wrapper.dataset.disabled = String(select.disabled);
      const selectedOption = menu.querySelector<HTMLElement>(
        `[data-option-index="${select.selectedIndex}"]`,
      );
      for (const option of menu.querySelectorAll<HTMLElement>(
        "[role='option']",
      ))
        option.setAttribute("aria-selected", String(option === selectedOption));
      if (!menu.hidden) positionMenu();
    };

    const renderOptions = () => {
      const previousActiveValue =
        enabledOptionButtons()[activeIndex]?.dataset.value;
      menu.replaceChildren();
      const appendOption = (option: HTMLOptionElement) => {
        const item = doc.createElement("button");
        item.type = "button";
        item.tabIndex = -1;
        item.id = `${wrapper.id}-option-${option.index}`;
        item.className = "custom-select-option";
        item.setAttribute("role", "option");
        item.dataset.optionIndex = String(option.index);
        item.dataset.value = option.value;
        item.textContent =
          option.label || option.textContent?.trim() || option.value;
        item.disabled =
          option.disabled ||
          Boolean(
            option.parentElement instanceof win.HTMLOptGroupElement &&
            option.parentElement.disabled,
          );
        item.setAttribute("aria-selected", String(option.selected));
        item.addEventListener("click", () => {
          if (item.disabled) return;
          select.value = option.value;
          select.dispatchEvent(new win.Event("input", { bubbles: true }));
          select.dispatchEvent(new win.Event("change", { bubbles: true }));
          close();
          trigger.focus();
        });
        item.addEventListener("pointermove", () => {
          if (item.disabled) return;
          setActiveOption(enabledOptionButtons().indexOf(item));
        });
        menu.append(item);
      };

      for (const child of Array.from(select.children)) {
        if (child.tagName === "OPTGROUP") {
          const group = child as HTMLOptGroupElement;
          const heading = doc.createElement("div");
          heading.className = "custom-select-group-label";
          heading.setAttribute("role", "presentation");
          heading.textContent = group.label;
          menu.append(heading);
          for (const option of Array.from(group.children))
            if (option.tagName === "OPTION")
              appendOption(option as HTMLOptionElement);
        } else if (child.tagName === "OPTION")
          appendOption(child as HTMLOptionElement);
      }

      const options = enabledOptionButtons();
      const nextActiveIndex = options.findIndex(
        (option) => option.dataset.value === previousActiveValue,
      );
      if (!menu.hidden)
        setActiveOption(nextActiveIndex >= 0 ? nextActiveIndex : 0);
      syncValue();
    };

    controller.close = close;
    controller.dispose = () => {
      if (!enhanced.has(select)) return;
      close();
      listenerController.abort();
      win.clearTimeout(typeaheadTimer);
      observer.disconnect();
      labelObserver?.disconnect();
      controllers.delete(controller);
      enhanced.delete(select);
      if (valueDescriptor?.get && valueDescriptor.set)
        delete (select as { value?: unknown }).value;
      select.classList.remove("custom-select-source");
      if (sourceTabIndex === null) select.removeAttribute("tabindex");
      else select.setAttribute("tabindex", sourceTabIndex);
      if (sourceAriaHidden === null) select.removeAttribute("aria-hidden");
      else select.setAttribute("aria-hidden", sourceAriaHidden);
      for (const [label, htmlFor] of sourceLabelFor) label.htmlFor = htmlFor;
      wrapper.remove();
      menu.remove();
      if (sourceParent)
        sourceParent.insertBefore(select, sourceNextSibling ?? null);
    };
    controllers.add(controller);

    trigger.addEventListener(
      "click",
      () => {
        if (menu.hidden) open();
        else close();
      },
      { signal: listenerController.signal },
    );
    trigger.addEventListener(
      "keydown",
      (e) => {
        const options = enabledOptionButtons();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (menu.hidden) open();
          else
            setActiveOption(
              activeIndex + (e.key === "ArrowDown" ? 1 : options.length - 1),
            );
        } else if (e.key === "Home") {
          e.preventDefault();
          if (menu.hidden) open();
          setActiveOption(0);
        } else if (e.key === "End") {
          e.preventDefault();
          if (menu.hidden) open();
          setActiveOption(options.length - 1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (menu.hidden) open();
          else options[activeIndex]?.click();
        } else if (e.key === "Escape" && !menu.hidden) {
          e.preventDefault();
          e.stopPropagation();
          close();
        } else if (e.key === "Tab" && !menu.hidden) close();
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          typeahead += e.key.toLocaleLowerCase();
          win.clearTimeout(typeaheadTimer);
          typeaheadTimer = win.setTimeout(() => (typeahead = ""), 700);
          const match = options.findIndex((option) =>
            option.textContent
              ?.trim()
              .toLocaleLowerCase()
              .startsWith(typeahead),
          );
          if (match >= 0) {
            if (menu.hidden) open();
            setActiveOption(match);
          }
        }
      },
      { signal: listenerController.signal },
    );

    const outsidePointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (
        target instanceof win.Node &&
        !wrapper.contains(target) &&
        !menu.contains(target)
      )
        close();
    };
    doc.addEventListener("pointerdown", outsidePointerDown, {
      capture: true,
      signal: listenerController.signal,
    });
    win.addEventListener("pointerleave", close, {
      signal: listenerController.signal,
    });
    doc.addEventListener("scroll", positionMenu, {
      capture: true,
      signal: listenerController.signal,
    });
    win.addEventListener("resize", positionMenu, {
      signal: listenerController.signal,
    });
    select.addEventListener("change", syncValue, {
      signal: listenerController.signal,
    });

    const observer = new win.MutationObserver(renderOptions);
    observer.observe(select, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
      attributeFilter: ["disabled", "label", "selected", "value"],
    });

    if (!labelledBy && !explicitLabel && sourceLabel) {
      labelObserver = new win.MutationObserver(() => {
        trigger.setAttribute(
          "aria-label",
          getLabelText() || "Select an option",
        );
      });
      labelObserver.observe(sourceLabel, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    const valueDescriptor = Object.getOwnPropertyDescriptor(
      win.HTMLSelectElement.prototype,
      "value",
    );
    if (valueDescriptor?.get && valueDescriptor.set) {
      Object.defineProperty(select, "value", {
        configurable: true,
        get() {
          return valueDescriptor.get!.call(this);
        },
        set(nextValue: string) {
          valueDescriptor.set!.call(this, nextValue);
          syncValue();
        },
      });
    }

    enhanced.set(select, controller);
    renderOptions();
  }

  function enhanceAll(root: ParentNode = document) {
    for (const select of root.querySelectorAll("select")) enhance(select);
  }

  function containsTarget(
    select: HTMLSelectElement,
    target: EventTarget | null,
  ) {
    const controller = enhanced.get(select);
    return Boolean(
      controller &&
      target instanceof select.ownerDocument.defaultView!.Node &&
      (controller.wrapper.contains(target) || controller.menu.contains(target)),
    );
  }

  function closeForSelect(select: HTMLSelectElement) {
    enhanced.get(select)?.close();
  }

  function disposeForSelect(select: HTMLSelectElement) {
    enhanced.get(select)?.dispose();
  }

  function isOpenForTarget(target: EventTarget | null) {
    const element = target as Element | null;
    return Boolean(element?.closest?.(".custom-select[data-open='true']"));
  }

  return {
    enhance,
    enhanceAll,
    containsTarget,
    closeForSelect,
    disposeForSelect,
    isOpenForTarget,
  };
})();
