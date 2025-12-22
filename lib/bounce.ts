export type BounceInput = {
  provider: "gmail" | "outlook";
  provider_message_id: string;
  campaign_id?: string | null;
  lead_id?: string | null;
  subject?: string | null;
  body?: string | null;
  received_at?: string | null;
};

export function mapGmailBounce(payload: any): BounceInput {
  const msg = payload?.message ?? payload;

  return {
    provider: "gmail",
    provider_message_id: msg?.id ?? msg?.message_id ?? "",
    campaign_id: msg?.campaign_id ?? null,
    lead_id: msg?.lead_id ?? null,
    subject: msg?.subject ?? "Delivery failure",
    body: msg?.snippet ?? msg?.text ?? "Delivery failed",
    received_at: msg?.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString(),
  };
}

export function mapOutlookBounce(payload: any): BounceInput {
  const m = payload?.value?.[0] ?? payload;

  return {
    provider: "outlook",
    provider_message_id: m?.id ?? m?.message_id ?? "",
    campaign_id: m?.campaign_id ?? null,
    lead_id: m?.lead_id ?? null,
    subject: m?.subject ?? "Delivery failure",
    body: m?.bodyPreview ?? m?.text ?? "Delivery failed",
    received_at: m?.receivedDateTime ?? new Date().toISOString(),
  };
}












