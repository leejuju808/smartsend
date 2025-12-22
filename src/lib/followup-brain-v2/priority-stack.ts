// Block 24900 — Follow-Up Brain v2: Priority Stack System
// Organizes leads into 4 urgency tiers

import { supabaseAdmin } from "@/server/supabase";

export type PriorityTier = 1 | 2 | 3 | 4;
// Tier 1: HOT LEADS (needs immediate follow-up)
// Tier 2: WARM LEADS (needs nurturing)
// Tier 3: INSURANCE LEADS (needs steady check-ins)
// Tier 4: DORMANT LEADS (needs revival)

/**
 * Gets leads by priority tier
 */
export async function getLeadsByTier(
  workspaceId: string,
  tier: PriorityTier,
  limit: number = 50
): Promise<any[]> {
  try {
    const { data: leads } = await supabaseAdmin
      .from('followup_priority_stack')
      .select(`
        *,
        leads (*)
      `)
      .eq('priority_tier', tier)
      .order('priority_score', { ascending: false })
      .limit(limit);

    if (!leads) {
      return [];
    }

    // Filter by workspace
    return leads
      .filter(item => {
        const lead = item.leads;
        return lead && lead.workspace_id === workspaceId;
      })
      .map(item => ({
        ...item.leads,
        priority_info: {
          tier: item.priority_tier,
          score: item.priority_score,
          reason: item.tier_reason,
        },
      }));
  } catch (error) {
    console.error('Error getting leads by tier:', error);
    return [];
  }
}

/**
 * Gets all priority tiers for a workspace
 */
export async function getPriorityStack(
  workspaceId: string
): Promise<{
  tier1: any[];
  tier2: any[];
  tier3: any[];
  tier4: any[];
}> {
  const [tier1, tier2, tier3, tier4] = await Promise.all([
    getLeadsByTier(workspaceId, 1),
    getLeadsByTier(workspaceId, 2),
    getLeadsByTier(workspaceId, 3),
    getLeadsByTier(workspaceId, 4),
  ]);

  return { tier1, tier2, tier3, tier4 };
}

/**
 * Updates priority tier for a lead (called automatically by trigger)
 */
export async function updateLeadPriority(
  leadId: string
): Promise<void> {
  // This is handled by the database trigger, but we can call it manually if needed
  try {
    await supabaseAdmin.rpc('update_lead_priority_tier', { p_lead_id: leadId });
  } catch (error) {
    console.error('Error updating lead priority:', error);
  }
}






































