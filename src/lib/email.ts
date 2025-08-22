export function normalizeEmail(e: string | undefined | null) {
  if (!e) return "";
  return String(e).trim().toLowerCase();
}

export function emailDomain(e: string) {
  const at = e.lastIndexOf("@");
  return at > -1 ? e.slice(at + 1).toLowerCase() : "";
}

export function isLikelyEmail(e: string) {
  if (!e) return false;
  // pragmatic, not perfect
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

