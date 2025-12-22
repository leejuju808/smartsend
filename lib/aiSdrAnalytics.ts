// lib/aiSdrAnalytics.ts
import { createClient } from "@/lib/supabase/server";

export async function getCampaignStats() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("ai_sdr_campaign_stats")
    .select("*")
    .order("campaign_created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getDailyStats({ days = 30 }: { days?: number }) {
  const supabase = createClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("ai_sdr_daily_stats")
    .select("*")
    .gte("day", since.toISOString().slice(0, 10))  // YYYY-MM-DD
    .order("day", { ascending: true });

  if (error) throw error;
  return data;
}

