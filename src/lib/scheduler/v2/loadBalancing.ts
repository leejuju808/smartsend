/**
 * Block 24140 — Advanced Scheduler v2
 * Component 6: Multi-Campaign Load Balancing
 * 
 * If a roofer runs multiple campaigns (revival, storm, repair, seasonal),
 * SmartSend auto-spreads sends to avoid saturation, protect inboxing,
 * optimize timing-based performance, and ensure every campaign has room to breathe
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCampaignPriority } from "./prioritization";

const supabase = supabaseAdmin;

export interface CampaignAllocation {
  campaignId: string;
  campaignType: string;
  priority: number;
  dailyAllocation: number; // How many emails this campaign can send today
  sendsToday: number;
  remainingAllocation: number;
}

/**
 * Balance daily send allocations across all active campaigns for a workspace
 */
export async function balanceCampaignLoads(
  workspaceId: string,
  totalDailyCap: number = 1000 // Total emails allowed per day for workspace
): Promise<CampaignAllocation[]> {
  // Get all active campaigns for workspace
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, campaign_type, campaign_priority, daily_cap, name")
    .eq("workspace_id", workspaceId)
    .in("status", ["active", "running"]);

  if (!campaigns || campaigns.length === 0) {
    return [];
  }

  // Get current allocations
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: existingAllocations } = await supabase
    .from("campaign_load_balance")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("last_balanced_at", today.toISOString());

  const allocationsMap = new Map<string, any>();
  if (existingAllocations) {
    for (const alloc of existingAllocations) {
      allocationsMap.set(alloc.campaign_id, alloc);
    }
  }

  // Calculate allocations based on priority and campaign caps
  const allocations: CampaignAllocation[] = [];

  // Sort campaigns by priority (highest first)
  const sortedCampaigns = campaigns.sort(
    (a, b) => (b.campaign_priority || 0) - (a.campaign_priority || 0)
  );

  // Distribute total daily cap based on priority weights
  let remainingCap = totalDailyCap;
  const totalPriorityWeight = sortedCampaigns.reduce(
    (sum, c) => sum + (c.campaign_priority || 100),
    0
  );

  for (const campaign of sortedCampaigns) {
    const priority = campaign.campaign_priority || getCampaignPriority(campaign.campaign_type as any);
    const priorityWeight = priority / totalPriorityWeight;
    const campaignCap = campaign.daily_cap || 200;

    // Calculate allocation based on priority weight, but respect campaign cap
    let allocation = Math.floor(totalDailyCap * priorityWeight);
    allocation = Math.min(allocation, campaignCap);
    allocation = Math.min(allocation, remainingCap);

    // Get sends today
    const { count: sendsToday } = await supabase
      .from("send_queue")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "sent")
      .gte("sent_at", today.toISOString());

    const existingAlloc = allocationsMap.get(campaign.id);
    const currentSends = sendsToday || 0;

    allocations.push({
      campaignId: campaign.id,
      campaignType: campaign.campaign_type || "other",
      priority: priority,
      dailyAllocation: allocation,
      sendsToday: currentSends,
      remainingAllocation: Math.max(0, allocation - currentSends),
    });

    remainingCap -= allocation;
  }

  // Update database with allocations
  for (const alloc of allocations) {
    // Check if record exists
    const { data: existing } = await supabase
      .from("campaign_load_balance")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", alloc.campaignId)
      .single();

    if (existing) {
      await supabase
        .from("campaign_load_balance")
        .update({
          daily_send_allocation: alloc.dailyAllocation,
          sends_today: alloc.sendsToday,
          priority_weight: alloc.priority / 1000,
          last_balanced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("campaign_load_balance").insert({
        workspace_id: workspaceId,
        campaign_id: alloc.campaignId,
        daily_send_allocation: alloc.dailyAllocation,
        sends_today: alloc.sendsToday,
        priority_weight: alloc.priority / 1000,
        last_balanced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  return allocations;
}

/**
 * Check if a campaign can send more emails today (within allocation)
 */
export async function canCampaignSendMore(
  campaignId: string
): Promise<{ canSend: boolean; remaining: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get allocation
  const { data: allocation } = await supabase
    .from("campaign_load_balance")
    .select("daily_send_allocation, sends_today")
    .eq("campaign_id", campaignId)
    .gte("last_balanced_at", today.toISOString())
    .single();

  if (!allocation) {
    // No allocation set, allow sending (will be balanced on next run)
    return { canSend: true, remaining: 1000 };
  }

  const remaining = Math.max(0, allocation.daily_send_allocation - allocation.sends_today);

  return {
    canSend: remaining > 0,
    remaining: remaining,
  };
}

/**
 * Increment sends today for a campaign (call after sending)
 */
export async function incrementCampaignSends(campaignId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get current allocation
  const { data: allocation } = await supabase
    .from("campaign_load_balance")
    .select("sends_today")
    .eq("campaign_id", campaignId)
    .gte("last_balanced_at", today.toISOString())
    .single();

  if (allocation) {
    await supabase
      .from("campaign_load_balance")
      .update({
        sends_today: (allocation.sends_today || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("campaign_id", campaignId)
      .gte("last_balanced_at", today.toISOString());
  }
}

/**
 * Get load balance summary for a workspace
 */
export async function getLoadBalanceSummary(
  workspaceId: string
): Promise<{
  totalAllocated: number;
  totalSent: number;
  totalRemaining: number;
  campaigns: CampaignAllocation[];
}> {
  const allocations = await balanceCampaignLoads(workspaceId);

  const totalAllocated = allocations.reduce((sum, a) => sum + a.dailyAllocation, 0);
  const totalSent = allocations.reduce((sum, a) => sum + a.sendsToday, 0);
  const totalRemaining = allocations.reduce((sum, a) => sum + a.remainingAllocation, 0);

  return {
    totalAllocated,
    totalSent,
    totalRemaining,
    campaigns: allocations,
  };
}

/**
 * Rebalance if a campaign is consuming too much of the daily cap
 */
export async function rebalanceIfNeeded(workspaceId: string): Promise<boolean> {
  const summary = await getLoadBalanceSummary(workspaceId);

  // If any campaign has used >80% of allocation, rebalance
  const needsRebalance = summary.campaigns.some(
    (a) => a.sendsToday > 0 && a.sendsToday / a.dailyAllocation > 0.8
  );

  if (needsRebalance) {
    await balanceCampaignLoads(workspaceId);
    return true;
  }

  return false;
}

