"use server";

import { createClient } from "@/utils/supabase/server";

export type CampaignReplyStats = {
  campaign_id: string;
  account_id: string;
  total_sends: number;
  total_replied: number;
  meeting_replies: number;
  positive_no_meeting_replies: number;
  neutral_question_replies: number;
  unsubscribe_replies: number;
  bounce_replies: number;
  last_reply_at: string | null;
};

export type CampaignLeadStatusCounts = {
  hot: number;
  warm: number;
  dead: number;
};

export async function getCampaignConversationsStarted(
  campaignId: string
): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("inbox_threads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  if (error) {
    console.error(error);
    return 0;
  }

  return count ?? 0;
}

export async function getCampaignReplyStats(
  campaignId: string
): Promise<CampaignReplyStats | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaign_reply_stats")
    .select("*")
    .eq("campaign_id", campaignId)
    .single();

  if (error) {
    // if no sends yet, view might not have a row
    if (error.code === "PGRST116" || error.code === "PGRST204") {
      return null;
    }
    console.error(error);
    return null;
  }

  return data as CampaignReplyStats;
}

export async function getCampaignLeadStatusCounts(
  campaignId: string
): Promise<CampaignLeadStatusCounts> {
  const supabase = createClient();

  const countFor = async (status: "hot" | "warm" | "dead") => {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("outreach_status", status);
    return count ?? 0;
  };

  const [hot, warm, dead] = await Promise.all([
    countFor("hot"),
    countFor("warm"),
    countFor("dead"),
  ]);

  return { hot, warm, dead };
}













