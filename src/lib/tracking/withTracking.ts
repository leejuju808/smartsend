import { sign, ClickPayload, OpenPayload } from "./token";
import { instrumentEmailHtml, pixelUrl, trackedHref } from "../tracking";

export function rewriteLinksAndInjectPixel(
  html: string,
  emailLogId: string,
  appUrl: string
): string {
  // Use the enhanced email_events tracking if available
  // Otherwise fall back to token-based tracking
  return instrumentEmailHtml(html, appUrl, emailLogId);
}

// Legacy token-based tracking (kept for backward compatibility)
export function rewriteLinksAndInjectPixelWithTokens(
  html: string,
  emailLogId: string,
  appUrl: string
): string {
  // Naive href rewriter (handles double/single quotes)
  const linkRe = /href=(["'])(https?:\/\/[^"']+)\1/gi;
  const now = Math.floor(Date.now() / 1000);
  
  const click = (url: string) => {
    const token = sign<ClickPayload>({
      email_log_id: emailLogId,
      url,
      exp: now + 60 * 60 * 24 * 7 // 7 days expiry
    });
    return `${appUrl}/api/t?t=${token}`;
  };
  
  const withClickTracking = html.replace(linkRe, (_m, q, url) => 
    `href=${q}${click(url)}${q}`
  );

  const openToken = sign<OpenPayload>({
    email_log_id: emailLogId,
    exp: now + 60 * 60 * 24 * 7 // 7 days expiry
  });
  const pixelUrl = `${appUrl}/api/o.gif?t=${openToken}`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;"/>`;

  // Inject pixel before closing body or at end
  if (withClickTracking.includes("</body>")) {
    return withClickTracking.replace("</body>", `${pixelTag}</body>`);
  }
  return withClickTracking + pixelTag;
} 