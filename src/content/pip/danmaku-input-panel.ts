"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuInputPanel = {
  create(
    doc: Document,
    t: (key: string) => string,
    options: {
      canSend: boolean;
      makeButton(
        action: string,
        label: string,
        ariaLabel: string,
      ): HTMLButtonElement;
    },
  ) {
    const toggle = options.makeButton(
      "danmaku-send-toggle",
      "",
      t("pipDanmakuInputOpen"),
    );
    toggle.title = t("pipDanmakuInputOpen");
    const icons = globalThis.PipCompanion?.icons;
    if (icons)
      toggle.append(
        icons.createSvg(doc, { innerHTML: icons.DANMAKU_SEND_INNER_HTML }),
      );
    toggle.hidden = !options.canSend;
    toggle.setAttribute("aria-expanded", "false");

    const panel = doc.createElement("form");
    panel.id = "danmaku-send-panel";
    panel.className = "danmaku-send-panel";
    toggle.setAttribute("aria-controls", panel.id);
    panel.hidden = true;
    const field = doc.createElement("div");
    field.className = "danmaku-send-field";
    const input = doc.createElement("input");
    input.className = "danmaku-send-input";
    input.type = "text";
    input.autocomplete = "off";
    input.setAttribute("aria-label", t("pipChatMessage"));
    const count = doc.createElement("span");
    count.className = "danmaku-send-count";
    count.id = "danmaku-send-count";
    input.setAttribute("aria-describedby", count.id);
    field.append(input, count);
    const submit = doc.createElement("button");
    submit.className = "danmaku-send-submit";
    submit.type = "submit";
    submit.textContent = t("pipSend");
    panel.append(field, submit);
    const status = doc.createElement("div");
    status.className = "danmaku-send-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    return { toggle, panel, input, count, submit, status };
  },
} satisfies DanmakuInputPanelApi;
