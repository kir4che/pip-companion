chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SAVE_PIP_SCREENSHOT") {
    const dataUrl = message.dataUrl;
    const tabUrl = sender.tab?.url || sender.url || "";
    if (
      !tabUrl.startsWith("https://www.youtube.com/") ||
      typeof dataUrl !== "string" ||
      !dataUrl.startsWith("data:image/png;base64,")
    ) {
      sendResponse({ ok: false });
      return;
    }
    const name =
      (typeof message.filename === "string" ? message.filename : "Screenshot")
        // eslint-disable-next-line no-control-regex -- strip control chars from filenames
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
        .replace(/^\.+/, "")
        .trim()
        .slice(0, 120) || "Screenshot";
    const filename = name.toLowerCase().endsWith(".png") ? name : `${name}.png`;
    void chrome.downloads
      .download({
        url: dataUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify",
      })
      .then(
        (downloadId) => sendResponse({ ok: true, downloadId }),
        () => sendResponse({ ok: false }),
      );
    return true;
  }
  if (message?.type !== "RESIZE_PIP_WINDOW") return;

  const sourceWindowId = sender.tab?.windowId;
  const innerWidth = Number(message.innerWidth);
  const width = Math.round(Number(message.width));
  const height = Math.round(Number(message.height));
  if (
    !Number.isFinite(innerWidth) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    sendResponse({ ok: false });
    return;
  }

  void chrome.tabs
    .query({ active: true })
    .then((tabs) => {
      const pipTab = tabs.find(
        (tab) =>
          tab.windowId !== sourceWindowId &&
          typeof tab.width === "number" &&
          Math.abs(tab.width - innerWidth) <= 3,
      );
      if (pipTab?.windowId === undefined) {
        sendResponse({ ok: false });
        return;
      }
      void chrome.windows.update(pipTab.windowId, { width, height }).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
    })
    .catch(() => sendResponse({ ok: false }));
  return true;
});
