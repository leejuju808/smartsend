// Email tracking utilities for injecting pixels and wrapping links

import { createUnsubSig } from "@/lib/crypto/hmac";

/**
 * Get the base URL for tracking endpoints
 */
function getTrackingBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_APP_URL ||
    "https://yourapp.com"
  );
}

/**
 * Generate open tracking pixel HTML
 * 
 * @param leadId - Lead UUID
 * @param campaignId - Campaign UUID
 * @returns HTML img tag for tracking pixel
 */
export function generateOpenPixel(leadId: string, campaignId: string): string {
  const baseUrl = getTrackingBaseUrl();
  const sig = createUnsubSig(leadId, campaignId);
  const pixelUrl = `${baseUrl}/track/open?c=${campaignId}&l=${leadId}&sig=${encodeURIComponent(sig)}`;
  
  return `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
}

/**
 * Wrap all links in HTML with click tracking redirects
 * 
 * @param html - HTML content
 * @param leadId - Lead UUID
 * @param campaignId - Campaign UUID
 * @returns HTML with wrapped links
 */
export function wrapLinksWithTracking(html: string, leadId: string, campaignId: string): string {
  const baseUrl = getTrackingBaseUrl();
  const sig = createUnsubSig(leadId, campaignId);
  
  // Replace all href attributes with tracking URLs
  return html.replace(/href="([^"]+)"/g, (match, url) => {
    // Skip mailto: links and other non-HTTP links
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return match;
    }
    
    const encoded = encodeURIComponent(url);
    const trackUrl = `${baseUrl}/track/click?u=${encoded}&c=${campaignId}&l=${leadId}&sig=${encodeURIComponent(sig)}`;
    return `href="${trackUrl}"`;
  });
}

/**
 * Inject tracking into email HTML body
 * - Adds open tracking pixel
 * - Wraps all links with click tracking
 * 
 * @param html - HTML content
 * @param leadId - Lead UUID
 * @param campaignId - Campaign UUID
 * @returns HTML with tracking injected
 */
export function injectEmailTracking(html: string, leadId: string, campaignId: string): string {
  // Wrap links first
  let trackedHtml = wrapLinksWithTracking(html, leadId, campaignId);
  
  // Add open tracking pixel
  const pixel = generateOpenPixel(leadId, campaignId);
  
  // Try to inject before </body> tag, otherwise append
  if (trackedHtml.includes("</body>")) {
    trackedHtml = trackedHtml.replace("</body>", `${pixel}</body>`);
  } else {
    trackedHtml = `${trackedHtml}${pixel}`;
  }
  
  return trackedHtml;
}












