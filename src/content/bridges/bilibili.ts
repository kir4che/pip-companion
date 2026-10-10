"use strict";

interface BilibiliPlaylistComponent {
  $parent: BilibiliPlaylistComponent | null;
  _props?: { info?: { bvid: string } };
  handleItemClick?: (info: { bvid: string }) => void;
}

(() => {
  window.addEventListener(
    "message",
    (e) => {
      if (
        e.source !== window ||
        e.origin !== location.origin ||
        e.data?.type !== "PIP_SELECT_BILI_ITEM" ||
        typeof e.data.bvid !== "string" ||
        !/^BV[0-9A-Za-z]+$/.test(e.data.bvid)
      )
        return;

      const item = document.querySelector<HTMLElement>(
        `.video-pod__item[data-key="${CSS.escape(e.data.bvid)}"]`,
      );
      const itemComponent = (
        item as (HTMLElement & { __vue__?: BilibiliPlaylistComponent }) | null
      )?.__vue__;
      const info = itemComponent?._props?.info;
      if (!item || !itemComponent || info?.bvid !== e.data.bvid) return;

      let parent = itemComponent.$parent;
      while (parent && typeof parent.handleItemClick !== "function")
        parent = parent.$parent;
      if (parent && info) parent.handleItemClick?.(info);
    },
    { passive: true },
  );
})();
