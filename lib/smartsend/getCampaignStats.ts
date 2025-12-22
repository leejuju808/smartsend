import { createClient } from "@/lib/supabase/server";

export type CampaignStats = {
  id: string;
  campaign_id: string;
  date: string;
  emails_sent: number;
  replies: number;
  failures: number;
  created_at: string;
};

/**
 * Get campaign stats for a specific campaign
 * Returns daily stats ordered by date (ascending)
 */
export async function getCampaignStats(campaignId: string): Promise<CampaignStats[]> {
  const supabase = createClient();
  
  const { data: stats, error } = await supabase
    .from("smartsend_campaign_stats")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching campaign stats:", error);
    throw error;
  }

  return stats || [];
}
