import { signLink } from "@/lib/signing";

export function ensureToken(
  q: { tracking_token?: string | null } | null | undefined,
) {
  return q?.tracking_token ?? crypto.randomUUID();
}

export function extractUrls(html: string): string[] {
  const re = /https?:\/\/[^\s"'<>)]+/gi;
  const out = new Set<string>();
  for (const m of html.match(re) || []) out.add(m);
  return [...out];
}

export function rewriteLinksForTracking(htmlOrText: string, token: string, fnBase: string) {
  if (!htmlOrText) return htmlOrText;
  const urlRx = /\bhttps?:\/\/[^\s)>"']+/gi;
  return htmlOrText.replace(urlRx, (match) => {
    try {
      new URL(match);
    } catch {
      return match;
    }
    const encodedToken = encodeURIComponent(token);
    const encodedDest = encodeURIComponent(match);
    const raw = `${fnBase}/click?t=${encodedToken}&u=${encodedDest}`;
    return signLink(raw);
  });
}

export function appendOpenPixel(html: string, token: string, fnBase: string) {
  const raw = `${fnBase}/open-pixel?t=${encodeURIComponent(token)}`;
  const secure = signLink(raw);
  const pixel =
    `<img src="${secure}" width="1" height="1" style="display:none" alt="" />`;
  if (!html) return pixel;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return html + pixel;
}