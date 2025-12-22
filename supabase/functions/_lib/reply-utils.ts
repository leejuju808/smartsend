export function safeLower(s?: string | null) {
  return (s ?? "").toLowerCase();
}

export function header(obj: Record<string, unknown> | null | undefined, name: string) {
  const source = obj ?? {};
  const foundKey = Object.keys(source).find((key) => key.toLowerCase() === name.toLowerCase());
  if (!foundKey) return null;
  const value = source[foundKey];
  return value == null ? null : String(value);
}

type ThreadKeyInput = {
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  from?: string | null;
  to?: string | null;
};

export function buildThreadKey({ messageId, inReplyTo, references, from, to }: ThreadKeyInput) {
  const refs = [inReplyTo, references].filter(Boolean).join(" ");
  const normalized = refs.replace(/[<>\s,]+/g, " ").toLowerCase().trim();
  if (normalized.length) return normalized;
  return `${safeLower(from)}→${safeLower(to)}`;
}






