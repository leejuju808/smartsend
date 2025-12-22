// URL tracking utility functions
// Generates tracking URLs for opens, clicks, and unsubscribes

/**
 * Base64URL encodes an object into a string
 */
function b64u(obj: any): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/**
 * Generate tracking pixel URL
 */
export function trackingPixelUrl(base: string, messageUuid: string): string {
  return `${base}/api/track/${messageUuid}`;
}

/**
 * Generate unsubscribe URL
 */
export function unsubscribeUrl(
  base: string, 
  orgId: string, 
  campaignId: string, 
  leadId: string
): string {
  const token = b64u({ o: orgId, c: campaignId, l: leadId });
  return `${base}/api/unsub/${token}`;
}

/**
 * Rewrite a single link to include click tracking
 */
export function rewriteLink(
  url: string,
  ctx: {
    base: string;
    orgId: string;
    campaignId: string;
    leadId: string;
    messageUuid: string;
  }
): string {
  const id = b64u({
    u: url,
    o: ctx.orgId,
    c: ctx.campaignId,
    l: ctx.leadId,
    m: ctx.messageUuid,
  });
  return `${ctx.base}/api/redirect/${id}`;
}

/**
 * Rewrite all links in HTML text
 * Simple implementation - for production, use a proper HTML parser
 */
export function rewriteLinks(
  html: string,
  ctx: {
    base: string;
    orgId: string;
    campaignId: string;
    leadId: string;
    messageUuid: string;
  }
): string {
  // For HTML emails, use regex to find and replace <a href="..."> tags
  // This is a simple implementation; for production, use a proper HTML parser
  return html.replace(
    /<a\s+href=["']([^"']+)["'][^>]*>/gi,
    (match, url) => {
      const trackedUrl = rewriteLink(url, ctx);
      return match.replace(url, trackedUrl);
    }
  );
}

/**
 * Inject tracking pixel into HTML
 */
export function injectTrackingPixel(
  html: string,
  pixelUrl: string
): string {
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
  
  // Try to inject before closing </body> tag
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  
  // Otherwise, append at the end
  return html + pixel;
}

/**
 * Add footer with unsubscribe link for plain text emails
 */
export function addTextFooter(
  text: string,
  unsubscribeUrl: string
): string {
  return `${text}\n\n---\nUnsubscribe: ${unsubscribeUrl}`;
}

