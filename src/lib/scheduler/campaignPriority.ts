/**
 * Block 182: Campaign Priority Scoring
 * 
 * Computes AI-based priority scores for campaigns to ensure:
 * - High-intent companies send first
 * - Hot accounts get priority
 * - SmartList campaigns are prioritized
 * - User-marked high priority campaigns are boosted
 * - Near-deadline campaigns get urgency boost
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export interface CampaignPriorityInput {
  campaign_id: string;
  account_id: string;
}

export interface CampaignData {
  id: string;
  smartlist_id?: string | null;
  priority?: string | null; // 'high' | 'normal' | 'low'
  deadline?: string | null; // ISO timestamp
  created_at: string;
  workspace_id?: string;
}

/**
 * Compute campaign priority score based on multiple factors
 */
export async function computeCampaignPriority(
  input: CampaignPriorityInput
): Promise<number> {
  const { campaign_id, account_id } = input;
  
  let score = 0;

  // Fetch campaign data
  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, smartlist_id, priority, created_at, workspace_id")
    .eq("id", campaign_id)
    .single();

  if (error || !campaign) {
    return 0; // Default priority if campaign not found
  }

  const campaignData = campaign as CampaignData;

  // 1. High-intent companies check (+10)
  // Check if campaign has leads with high-intent companies
  try {
    // Get leads for this campaign
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("company, company_id")
      .eq("campaign_id", campaign_id)
      .or("company.not.is.null,company_id.not.is.null")
      .limit(100);

    if (leads && leads.length > 0) {
      // Check for high-intent companies via company_id or domain lookup
      const companyIds = leads.map(l => l.company_id).filter(Boolean);
      const companyNames = leads.map(l => l.company).filter(Boolean);

      if (companyIds.length > 0) {
        const { data: highIntentCompanies } = await supabaseAdmin
          .from("companies")
          .select("intent_score")
          .in("id", companyIds)
          .gt("intent_score", 50); // Threshold for "high intent"

        if (highIntentCompanies && highIntentCompanies.length > 0) {
          score += 10;
        }
      }
    }
  } catch (e) {
    // Silently fail if companies table doesn't exist or schema differs
    console.warn("Could not check high-intent companies:", e);
  }

  // 2. Newly hot accounts (+6)
  // Check for recently engaged companies (last 7 days)
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: leads } = await supabaseAdmin
      .from("leads")
      .select("company_id")
      .eq("campaign_id", campaign_id)
      .not("company_id", "is", null)
      .limit(100);

    if (leads && leads.length > 0) {
      const companyIds = leads.map(l => l.company_id).filter(Boolean);
      
      const { count: hotAccountsCount } = await supabaseAdmin
        .from("company_engagement")
        .select("*", { count: "exact", head: true })
        .gte("last_engaged_at", sevenDaysAgo.toISOString())
        .in("company_id", companyIds);

      if (hotAccountsCount && hotAccountsCount > 0) {
        score += 6;
      }
    }
  } catch (e) {
    // Silently fail if company_engagement table doesn't exist
    console.warn("Could not check hot accounts:", e);
  }

  // 3. AI SmartList (+5)
  if (campaignData.smartlist_id) {
    score += 5;
  }

  // 4. User-marked "High Priority" (+4)
  if (campaignData.priority === "high") {
    score += 4;
  }

  // 5. Near deadline (+3)
  // Check if campaign has a deadline approaching (within 48 hours)
  if (campaignData.deadline) {
    const deadline = new Date(campaignData.deadline);
    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilDeadline > 0 && hoursUntilDeadline <= 48) {
      score += 3;
    }
  }

  // 6. Recency score (+1 per day since creation, max +7)
  const createdAt = new Date(campaignData.created_at);
  const now = new Date();
  const daysSinceCreation = Math.floor(
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  score += Math.min(daysSinceCreation, 7);

  return score;
}

/**
 * Batch compute priorities for multiple campaigns
 */
export async function computeCampaignPriorities(
  inputs: CampaignPriorityInput[]
): Promise<Map<string, number>> {
  const priorities = new Map<string, number>();
  
  await Promise.all(
    inputs.map(async (input) => {
      const priority = await computeCampaignPriority(input);
      priorities.set(input.campaign_id, priority);
    })
  );
  
  return priorities;
}

/**
 * Get priority for a single campaign (cached version)
 */
export async function getCampaignPriority(
  campaignId: string,
  accountId: string
): Promise<number> {
  return computeCampaignPriority({ campaign_id: campaignId, account_id: accountId });
}

