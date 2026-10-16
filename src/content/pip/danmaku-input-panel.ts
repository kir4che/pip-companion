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
    const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const bubble = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    bubble.setAttribute(
      "d",
      "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16z",
    );
    bubble.setAttribute("fill-rule", "evenodd");
    icon.append(bubble);
    for (const x of [8, 12, 16]) {
      const dot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", "10");
      dot.setAttribute("r", "1");
      icon.append(dot);
    }
    toggle.append(icon);
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
