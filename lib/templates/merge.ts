import { signUnsub } from "@/lib/suppress/token";
import { createUnsubSig } from "@/lib/crypto/hmac";

export type Merge = Record<string, string | number | null | undefined>;

/**
 * Generates an unsubscribe link URL for a lead and campaign
 * @param leadId - The lead ID
 * @param campaignId - The campaign ID (can be empty string for global unsubscribe)
 * @returns The unsubscribe URL
 */
export function generateUnsubscribeLink(leadId: string, campaignId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://yourapp.com";
  const sig = createUnsubSig(leadId, campaignId || "");
  return `${baseUrl}/unsubscribe?l=${encodeURIComponent(leadId)}&c=${encodeURIComponent(campaignId || "")}&sig=${sig}`;
}

export function applyMergeTags(html: string, merge: Merge) {
  let out = html;
  for (const [k, v] of Object.entries(merge)) {
    const val = (v ?? "").toString();
    const re = new RegExp(`{{\\s*${k}\\s*}}`, "gi");
    out = out.replace(re, val);
  }
  // remove unreplaced {{token}} safely
  out = out.replace(/{{\s*[\w.-]+\s*}}/g, "");
  return out;
}

/**
 * Replaces $UNSUBSCRIBE_LINK merge tag with actual unsubscribe URL
 * @param html - The HTML content
 * @param leadId - The lead ID
 * @param campaignId - The campaign ID (optional)
 * @returns HTML with unsubscribe link replaced
 */
export function replaceUnsubscribeLink(html: string, leadId: string, campaignId?: string | null): string {
  if (!leadId) return html;
  const unsubLink = generateUnsubscribeLink(leadId, campaignId || "");
  // Replace $UNSUBSCRIBE_LINK (case-insensitive, with optional whitespace)
  return html.replace(/\$UNSUBSCRIBE_LINK/gi, unsubLink);
}

export function withFooterUnsub(
  bodyHtml: string,
  userId: string,
  recipientEmail: string,
  campaignId?: string
): string {
  const token = signUnsub({ u: userId, e: recipientEmail, c: campaignId });
  const url = `${process.env.NEXT_PUBLIC_BASE_URL}/api/unsub?t=${encodeURIComponent(token)}`;
  const footer = `
    <hr style="border:0;border-top:1px solid #eee;margin-top:24px"/>
    <p style="color:#777;font-size:12px">
      Don't want emails from us? <a href="${url}">Unsubscribe</a>.
    </p>`;
  return bodyHtml + footer;
}