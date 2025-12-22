export type RewriteOut = {
  html: string;
  links: { idx: number; from: string; to: string; code: string }[];
  pixelSrc: string;
};

function base62(n: number) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  let value = Math.max(0, Math.floor(n));
  do {
    s = chars[value % 62] + s;
    value = Math.floor(value / 62);
  } while (value > 0);
  return s;
}

function normalizeHost(host: string) {
  return host.endsWith("/") ? host.slice(0, -1) : host;
}

export async function rewriteHtmlForTracking({
  accountId: _accountId,
  queueId,
  html,
  trackingHost,
}: {
  accountId: string;
  queueId: string;
  html: string;
  trackingHost: string;
}): Promise<RewriteOut> {
  void _accountId;
  const host = normalizeHost(trackingHost);
  const aTagRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const links: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = aTagRegex.exec(html)) !== null) {
    const url = m[1];
    if (!/^https?:\/\//i.test(url)) continue;
    links.push(url);
  }

  const map = links.map((url, i) => {
    const code = `${base62(i)}${queueId.toString().slice(0, 8)}`;
    const to = `${host}/r/${code}`;
    return { idx: i, from: url, to, code };
  });

  let out = html;
  for (const l of map) {
    out = out.replace(l.from, l.to);
  }

  const pixelSrc = `${host}/o/${queueId}`;
  const pixelTag = `<img src="${pixelSrc}" width="1" height="1" alt="" style="display:none" />`;
  out = /<\/body>/i.test(out)
    ? out.replace(/<\/body>/i, `${pixelTag}</body>`)
    : out + pixelTag;

  return { html: out, links: map, pixelSrc };
}

