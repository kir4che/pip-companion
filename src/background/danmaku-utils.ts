export function isSupportedDanmakuSender(
  sender: chrome.runtime.MessageSender,
): boolean {
  if (sender.tab?.id === undefined || !sender.url || !sender.tab.url)
    return false;
  try {
    const senderUrl = new URL(sender.url);
    const tabUrl = new URL(sender.tab.url);
    return (
      (senderUrl.protocol === "https:" || senderUrl.protocol === "http:") &&
      senderUrl.origin === tabUrl.origin
    );
  } catch {
    return false;
  }
}

export async function readResponseBytes(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  if (!res.body) {
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes)
      throw new Error(`${label} response is too large`);
    return new Uint8Array(buffer);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} response is too large`);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
