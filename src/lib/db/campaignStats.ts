import { createClient } from "@supabase/supabase-js";

export interface CampaignDeliveryTotals {
  campaign_id: string;
  attempts: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  replied: number;
  opened: number;
  clicked: number;
  reply_rate_pct: number | null;
  open_rate_pct: number | null;
  click_rate_pct: number | null;
  bounce_rate_pct: number | null;
  complaint_rate_pct: number | null;
  unsub_rate_pct: number | null;
}

export interface CampaignDailyDelivery {
  campaign_id: string;
  day: string;
  attempts: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  replied: number;
  opened: number;
  clicked: number;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function getCampaignStats(campaignId: string) {
  const admin = getAdminClient();

  const { data: totals, error: totalsError } = await admin
    .from<CampaignDeliveryTotals>("v_campaign_delivery_stats")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (totalsError && totalsError.code !== "PGRST116") {
    throw totalsError;
  }

  const { data: daily, error: dailyError } = await admin
    .from<CampaignDailyDelivery>("v_campaign_daily_delivery")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("day", { ascending: true });

  if (dailyError) {
    throw dailyError;
  }

  return { totals: totals ?? null, daily: daily ?? [] };
}












