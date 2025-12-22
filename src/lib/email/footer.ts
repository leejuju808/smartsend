import { buildUnsubHeaders, renderFooter } from "@/lib/unsub";

export function buildFooter(campaignId: string, recipientEmail: string) {
  return renderFooter(campaignId, recipientEmail);
}

export function listUnsubHeaders(campaignId: string, recipientEmail: string) {
  return buildUnsubHeaders(campaignId, recipientEmail);
}