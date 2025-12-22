import { sign } from "./tokens.ts";

export async function makeTrackingToken(payload: Record<string, any>, secret: string) {
  return await sign(payload, secret); // HMAC-signed JSON
}

export function base64url(s: string) {
  return btoa(encodeURIComponent(s)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

// New simplified instrumentation using send_log_id directly
export function instrumentHtml({
  html,
  sendLogId,
  baseUrl,
}: { html: string; sendLogId: string; baseUrl: string; }): string {
  // Ensure baseUrl has /functions/v1 prefix
  const trackingBase = baseUrl.endsWith('/functions/v1') ? baseUrl : 
                       baseUrl.endsWith('/functions') ? `${baseUrl}/v1` :
                       `${baseUrl}/functions/v1`;
  
  // 1) Click wrap: replace hrefs with redirector
  const re = /href\s*=\s*"(https?:\/\/[^"]+)"/gi;
  const wrapped = html.replace(re, (_m, p1) => {
    const encUrl = encodeURIComponent(p1);
    const click = `${trackingBase}/track-click?sid=${sendLogId}&u=${encUrl}`;
    return `href="${click}"`;
  });

  // 2) Open pixel: add at bottom of body
  const pixel = `<img src="${trackingBase}/track-open?sid=${sendLogId}" width="1" height="1" style="display:none" alt="" />`;

  if (wrapped.includes("</body>")) {
    return wrapped.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return wrapped + pixel;
}

// Legacy function for backward compatibility (uses token-based approach)
export function injectPixelAndRewrite(html: string, token: string, appUrl: string) {
  const pixel = `<img src="${appUrl}/functions/v1/track-open?t=${encodeURIComponent(token)}" width="1" height="1" style="display:none" alt="" />`;
  // naive HTML rewrite for anchors
  const re = /<a\s+([^>]*?)href="([^"]+)"([^>]*)>/gi;
  const rewritten = html.replace(re, (_m, pre, href, post) => {
    // keep mailto/tel untouched
    if (/^mailto:|^tel:|^#/.test(href)) return `<a ${pre}href="${href}"${post}>`;
    const wrapped = `${appUrl}/functions/v1/r?t=${encodeURIComponent(token)}&u=${base64url(href)}`;
    return `<a ${pre}href="${wrapped}"${post}>`;
  });
  // add pixel just before </body> if present
  if (rewritten.includes("</body>")) {
    return rewritten.replace("</body>", `${pixel}</body>`);
  }
  return rewritten + pixel;
}
