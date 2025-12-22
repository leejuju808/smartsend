// lib/campaigns/buildSendQueue.ts
// Helper function to build send queue for a campaign with segment filtering

import { createClient } from "@/utils/supabase/server";
import { applySegmentFilters } from "@/lib/segments/query-builder";
import type { SegmentRuleNode } from "@/lib/segments/debug";

type Campaign = {
  id: string;
  account_id: string;
  segment_id: string | null;
  [key: string]: any;
};

type Segment = {
  id: string;
  account_id: string;
  rule: any; // JSONB rule structure
  [key: string]: any;
};

type Lead = {
  id: string;
  account_id: string;
  [key: string]: any;
};

/**
 * Build send queue for a campaign, applying segment filtering if segment_id is set
 */
export async function buildSendQueueForCampaign(campaignId: string) {
  const supabase = createClient();

  // 1) Load campaign (includes segment_id)
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single<Campaign>();

  if (campaignError || !campaign) {
    throw new Error(
      `Campaign not found for send queue: ${campaignError?.message}`
    );
  }

  // 2) Optional: load segment if set
  let segment: Segment | null = null;
  let rules: SegmentRuleNode | null = null;

  if (campaign.segment_id) {
    const { data, error } = await supabase
      .from("segments")
      .select("*")
      .eq("id", campaign.segment_id)
      .eq("account_id", campaign.account_id)
      .single<Segment>();

    if (error) {
      throw new Error(`Segment lookup failed: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Segment ${campaign.segment_id} not found`);
    }

    segment = data;
    
    // Normalize rules from segment.rule (JSONB)
    // The rule might be stored as a SegmentRuleNode or in a different format
    // For now, we'll try to use it directly, but you may need to normalize it
    rules = (segment.rule ?? null) as SegmentRuleNode | null;
  }

  // 3) Base leads query: account-level
  let leadsQuery = supabase
    .from("leads")
    .select("*")
    .eq("account_id", campaign.account_id) as any;

  // 4) Apply segment filters if applicable
  if (rules) {
    leadsQuery = applySegmentFilters(leadsQuery, rules);
  }

  const { data: leads, error: leadsError } = await leadsQuery;

  if (leadsError) {
    throw new Error(`Lead selection failed: ${leadsError.message}`);
  }

  const leadList = (leads ?? []) as Lead[];

  // 5) Write to send_queue table (or your equivalent)
  const sendQueueRows = leadList.map((lead) => ({
    campaign_id: campaign.id,
    account_id: campaign.account_id,
    lead_id: lead.id,
    status: "pending",
  }));

  if (sendQueueRows.length) {
    const { error: insertError } = await supabase
      .from("send_queue")
      .insert(sendQueueRows);

    if (insertError) {
      throw new Error(`Send queue insert failed: ${insertError.message}`);
    }
  }

  return {
    campaign_id: campaign.id,
    total_enqueued: sendQueueRows.length,
  };
}












