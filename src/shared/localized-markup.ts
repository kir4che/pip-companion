"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.localizedMarkup = {
  create(doc: Document, translate: (key: string) => string) {
    const placeholder = /__MSG_([A-Za-z0-9_@]+)__/g;
    const localizeText = (value: string) =>
      value.replace(placeholder, (_, key: string) => translate(key));
    const walker = doc.createTreeWalker(
      doc.documentElement,
      NodeFilter.SHOW_TEXT,
    );
    const textNodes: { node: Text; source: string }[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const source = node.textContent ?? "";
      if (source.includes("__MSG_")) textNodes.push({ node, source });
    }
    const attributes: { attribute: Attr; source: string }[] = [];
    for (const element of doc.querySelectorAll("*")) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.value.includes("__MSG_"))
          attributes.push({ attribute, source: attribute.value });
      }
    }

    return () => {
      for (const { node, source } of textNodes)
        node.textContent = localizeText(source);
      for (const { attribute, source } of attributes)
        attribute.value = localizeText(source);
    };
  },
};
