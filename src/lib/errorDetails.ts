// Short-lived in-memory store for expandable error details.
// Button `value` is limited to 2000 chars, so we store the full payload
// here and only pass a short id in the button.
const store = new Map<string, { text: string; expiresAt: number }>();

const TTL_MS = 10 * 60 * 1000;

export function createErrorDetails(text: string): string {
  const id = crypto.randomUUID().slice(0, 8);
  store.set(id, { text, expiresAt: Date.now() + TTL_MS });
  // opportunistic cleanup
  if (store.size > 200) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k);
    }
  }
  return id;
}

export function getErrorDetails(id: string): string | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(id);
    return undefined;
  }
  return entry.text;
}

export function chunkForModal(text: string, max = 2800): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const next = cur ? cur + "\n" + line : line;
    if (next.length > max) {
      if (cur) chunks.push(cur);
      cur = line.length > max ? line.slice(0, max) : line;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
