// /lib/send/checkSendSafety.ts
// Computes send-safety stats per campaign using a Supabase RPC.
// Requires SQL from /supabase/sql/send_safety.sql

import { getBrowserSupabase } from "@/lib/supabase";

export type SendSafetyStats = {
  rows_total: number;            // total rows in campaign (including duplicates)
  distinct_total: number;        // distinct emails in campaign
  duplicates_in_campaign: number;// rows_total - distinct_total
  suppressed_count: number;      // distinct emails that are suppressed
  sendable_count: number;        // distinct_total - suppressed_count
};

export async function checkSendSafety(campaignId: string): Promise<SendSafetyStats> {
  const supabase = getBrowserSupabase();
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) throw new Error("Not authenticated");
  const uid = ures.user.id;

  const { data, error } = await supabase.rpc("compute_campaign_send_safety", {
    in_profile_id: uid,
    in_campaign_id: campaignId,
  });
  if (error) throw error;

  // RPC returns a single row with the stats
  const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
  if (!row) {
    return {
      rows_total: 0,
      distinct_total: 0,
      duplicates_in_campaign: 0,
      suppressed_count: 0,
      sendable_count: 0,
    };
  }

  return {
    rows_total: Number(row.rows_total ?? 0),
    distinct_total: Number(row.distinct_total ?? 0),
    duplicates_in_campaign: Number(row.duplicates_in_campaign ?? 0),
    suppressed_count: Number(row.suppressed_count ?? 0),
    sendable_count: Number(row.sendable_count ?? 0),
  };
}

/** Enqueue a campaign safely (filters duplicates & suppressions in SQL). */
export async function enqueueCampaignSafely(campaignId: string): Promise<{
  inserted_count: number;
  skipped_suppressed: number;
  skipped_duplicates: number;
}> {
  const supabase = getBrowserSupabase();
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) throw new Error("Not authenticated");
  const uid = ures.user.id;

  const { data, error } = await supabase.rpc("enqueue_campaign_safely", {
    in_profile_id: uid,
    in_campaign_id: campaignId,
  });
  if (error) throw error;

  const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
  return {
    inserted_count: Number(row?.inserted_count ?? 0),
    skipped_suppressed: Number(row?.skipped_suppressed ?? 0),
    skipped_duplicates: Number(row?.skipped_duplicates ?? 0),
  };
} 