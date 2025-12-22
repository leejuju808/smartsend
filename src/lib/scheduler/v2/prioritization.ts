/**
 * Block 24140 — Advanced Scheduler v2
 * Component 4: Send Queue Prioritization (High ROI First)
 * 
 * SmartSend prioritizes:
 * 1. Storm Campaigns (priority 1000)
 * 2. Hot/Warm Follow-Up (priority 800)
 * 3. Lead Revival (priority 800)
 * 4. Free Estimate (priority 400)
 * 5. Low-ROI campaigns last (priority 200)
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

const supabase = supabaseAdmin;

export type CampaignType =
  | "storm"
  | "revival"
  | "followup"
  | "free_estimate"
  | "repair"
  | "seasonal"
  | "other";

const CAMPAIGN_PRIORITIES: Record<CampaignType, number> = {
  storm: 1000,
  revival: 800,
  followup: 600,
  repair: 500,
  free_estimate: 400,
  seasonal: 300,
  other: 200,
};

/**
 * Get priority for a campaign type
 */
export function getCampaignPriority(campaignType: CampaignType | null): number {
  if (!campaignType) {
    return CAMPAIGN_PRIORITIES.other;
  }
  return CAMPAIGN_PRIORITIES[campaignType] || CAMPAIGN_PRIORITIES.other;
}

/**
 * Update campaign priority based on type
 */
export async function updateCampaignPriority(
  campaignId: string,
  campaignType: CampaignType
): Promise<void> {
  const priority = getCampaignPriority(campaignType);

  // Update campaign
  await supabase
    .from("campaigns")
    .update({
      campaign_type: campaignType,
      campaign_priority: priority,
    })
    .eq("id", campaignId);

  // Update all pending queue items for this campaign
  await supabase
    .from("send_queue")
    .update({ priority })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
}

/**
 * Get prioritized queue items for sending
 * Returns queue items ordered by priority (highest first), then scheduled_at
 */
export async function getPrioritizedQueueItems(
  workspaceId: string,
  limit: number = 50
): Promise<any[]> {
  const { data: items, error } = await supabase
    .from("send_queue")
    .select(`
      *,
      campaigns!inner(workspace_id, campaign_type, campaign_priority, status)
    `)
    .eq("status", "pending")
    .eq("campaigns.workspace_id", workspaceId)
    .eq("campaigns.status", "active")
    .lte("scheduled_at", new Date().toISOString())
    .order("priority", { ascending: false }) // Higher priority first
    .order("scheduled_at", { ascending: true }) // Then by scheduled time
    .limit(limit);

  if (error) {
    console.error("Error fetching prioritized queue items:", error);
    return [];
  }

  return items || [];
}

/**
 * Ensure all campaigns have correct priority set
 */
export async function syncCampaignPriorities(workspaceId?: string): Promise<void> {
  let query = supabase.from("campaigns").select("id, campaign_type, campaign_priority");

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data: campaigns } = await query;

  if (!campaigns) {
    return;
  }

  for (const campaign of campaigns) {
    const expectedPriority = getCampaignPriority(
      (campaign.campaign_type as CampaignType) || null
    );

    if (campaign.campaign_priority !== expectedPriority) {
      await supabase
        .from("campaigns")
        .update({ campaign_priority: expectedPriority })
        .eq("id", campaign.id);

      // Update queue items
      await supabase
        .from("send_queue")
        .update({ priority: expectedPriority })
        .eq("campaign_id", campaign.id)
        .eq("status", "pending");
    }
  }
}

/**
 * Boost priority for storm campaigns (emergency override)
 */
export async function boostStormCampaigns(workspaceId: string): Promise<void> {
  const { data: stormCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("campaign_type", "storm")
    .in("status", ["active", "running"]);

  if (!stormCampaigns) {
    return;
  }

  const stormPriority = CAMPAIGN_PRIORITIES.storm;

  for (const campaign of stormCampaigns) {
    await supabase
      .from("campaigns")
      .update({ campaign_priority: stormPriority })
      .eq("id", campaign.id);

    await supabase
      .from("send_queue")
      .update({ priority: stormPriority })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending");
  }
}

/**
 * Get campaign type from campaign name or template key
 * (Helper function to infer type if not explicitly set)
 */
export function inferCampaignType(
  campaignName?: string,
  templateKey?: string
): CampaignType | null {
  const name = (campaignName || "").toLowerCase();
  const key = (templateKey || "").toLowerCase();

  if (name.includes("storm") || key.includes("storm")) {
    return "storm";
  }
  if (name.includes("revival") || name.includes("revive") || key.includes("revival")) {
    return "revival";
  }
  if (name.includes("follow") || name.includes("followup") || key.includes("followup")) {
    return "followup";
  }
  if (name.includes("repair") || key.includes("repair")) {
    return "repair";
  }
  if (name.includes("seasonal") || key.includes("seasonal")) {
    return "seasonal";
  }
  if (name.includes("free") && (name.includes("estimate") || name.includes("inspection"))) {
    return "free_estimate";
  }

  return null;
}






































