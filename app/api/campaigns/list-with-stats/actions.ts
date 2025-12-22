"use server";

import { createClient } from "@/utils/supabase/server";

export type CampaignWithStats = {
  id: string;
  account_id: string;
  name: string;
  status: string | null;
  created_at: string;
  segment_id: string | null;
  segment_name: string | null;
  smartlist_id: string | null;
  total_sends: number;
  total_replied: number;
  open_rate: number | null;
  click_rate: number | null;
};

export async function listCampaignsWithStats(
  accountId: string
): Promise<CampaignWithStats[]> {
  const supabase = createClient();

  // 1) Load campaigns for this account
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, account_id, name, status, created_at, segment_id, smartlist_id, open_rate, click_rate")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (campaignsError) {
    throw campaignsError;
  }

  const campaignRows = (campaigns ?? []) as {
    id: string;
    account_id: string;
    name: string;
    status: string | null;
    created_at: string;
    segment_id: string | null;
    smartlist_id: string | null;
    open_rate: number | null;
    click_rate: number | null;
  }[];

  if (campaignRows.length === 0) {
    return [];
  }

  const campaignIds = campaignRows.map((c) => c.id);

  // 2) Load send logs for these campaigns to compute stats
  const { data: logs, error: logsError } = await supabase
    .from("send_logs")
    .select("campaign_id, reply_status")
    .in("campaign_id", campaignIds);

  if (logsError) {
    throw logsError;
  }

  const logsRows = (logs ?? []) as { campaign_id: string; reply_status: string | null }[];

  // 3) Compute stats per campaign in memory
  const statMap = new Map<
    string,
    { total_sends: number; total_replied: number }
  >();

  for (const cId of campaignIds) {
    statMap.set(cId, { total_sends: 0, total_replied: 0 });
  }

  for (const log of logsRows) {
    const bucket = statMap.get(log.campaign_id);
    if (!bucket) continue;
    bucket.total_sends += 1;
    if (log.reply_status === "replied") {
      bucket.total_replied += 1;
    }
  }

  // 4) Load segments to resolve segment names
  const segmentIds = Array.from(
    new Set(
      campaignRows
        .map((c) => c.segment_id)
        .filter((id): id is string => !!id)
    )
  );

  const segmentNameMap = new Map<string, string>();

  if (segmentIds.length > 0) {
    const { data: segments, error: segmentsError } = await supabase
      .from("segments")
      .select("id, name")
      .in("id", segmentIds);

    if (!segmentsError && segments) {
      for (const seg of segments as { id: string; name: string }[]) {
        segmentNameMap.set(seg.id, seg.name);
      }
    }
  }

  // 5) Build final shape
  return campaignRows.map((c) => {
    const stats = statMap.get(c.id) ?? { total_sends: 0, total_replied: 0 };

    return {
      id: c.id,
      account_id: c.account_id,
      name: c.name,
      status: c.status,
      created_at: c.created_at,
      segment_id: c.segment_id,
      segment_name: c.segment_id ? segmentNameMap.get(c.segment_id) ?? null : null,
      smartlist_id: c.smartlist_id ?? null,
      total_sends: stats.total_sends,
      total_replied: stats.total_replied,
      open_rate: c.open_rate ?? null,
      click_rate: c.click_rate ?? null,
    };
  });
}


