import { renderFooter } from "@/lib/unsub";

export function withUnsubscribeFooter(
  html: string,
  campaignId: string | null | undefined,
  recipientEmail: string,
  reason?: string | null
): string {
  if (!campaignId) return html;

  const footer = renderFooter(campaignId, recipientEmail, reason);

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }

  return `${html}${footer}`;
}