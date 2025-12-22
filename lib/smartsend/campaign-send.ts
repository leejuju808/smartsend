// lib/smartsend/campaign-send.ts
// Block 8140 — Fetch campaign send stats + recipients

import { createClient } from "@/lib/supabase/server";

export type CampaignSendStats = {
  campaign_id: string;
  total_jobs: number;

  pending_count: number;
  processing_count: number;
  retry_count: number;
  failed_count: number;
  sent_count: number;

  replied_count: number;

  sent_rate: number;
  failure_rate: number;
  reply_rate: number;

  last_sent_at: string | null;
  last_replied_at: string | null;
};

export type CampaignRecipientRow = {
  queue_id: string;
  campaign_id: string;
  lead_id: string | null;
  to_email: string;

  queue_status: string;
  attempts: number;
  max_attempts: number;
  sent_at: string | null;

  reply_status: "none" | "replied" | "ignore";
  replied_at: string | null;
  last_inbound_message: string | null;

  last_event_status: string | null;
  last_event_error: string | null;
  last_event_at: string | null;

  last_reply_type: "positive" | "neutral" | "negative" | "ooh" | "unsubscribe" | "unknown" | null;
};

export async function getCampaignSendStats(
  campaignId: string,
): Promise<CampaignSendStats | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaign_send_stats")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle<CampaignSendStats>();

  if (error) {
    console.error("getCampaignSendStats error:", error);
    return null;
  }

  return data;
}

export async function getCampaignRecipients(
  campaignId: string,
  options?: { limit?: number; offset?: number },
): Promise<CampaignRecipientRow[]> {
  const supabase = createClient();

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const { data, error } = await supabase
    .from("campaign_lead_send_status")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("last_event_at", { ascending: false, nullsFirst: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("getCampaignRecipients error:", error);
    return [];
  }

  return data as CampaignRecipientRow[];
}

