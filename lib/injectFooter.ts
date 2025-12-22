import { makeUnsubLink } from "@/lib/unsub";

export function injectFooter(html: string, {
  accountId, leadId, campaignId, emailId, company, address
}: {
  accountId: string; leadId: string; campaignId?: string|null; emailId?: string|null; company?: string; address?: string;
}) {
  const link = makeUnsubLink({ accountId, leadId, campaignId, emailId });
  const footer = `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
      <div>${company || "Our Company"}</div>
      ${address ? `<div>${address}</div>` : ""}
      <div>
        <a href="${link}" target="_blank">Unsubscribe or manage preferences</a>
      </div>
    </div>`;
  return html.includes("</body>") ? html.replace("</body>", footer + "</body>") : (html + footer);
}















