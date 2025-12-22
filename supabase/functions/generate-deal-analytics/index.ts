// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface DealAnalyticsData {
  totals: {
    open_value: number;
    forecast_value: number;
    won_value: number;
    lost_value: number;
    open_deals: number;
    won_deals: number;
    lost_deals: number;
  };
  by_stage: Array<{
    stage: string;
    count: number;
    value: number;
    avg_age_days: number;
  }>;
  stage_conversion: Record<string, number>;
  velocity: Record<string, number>;
  owner_splits: Array<{
    owner_id: string;
    name: string;
    open_deals: number;
    open_value: number;
    won_deals: number;
    won_value: number;
    avg_velocity_days: number;
  }>;
  deal_sources: Array<{
    campaign_id: string;
    name: string;
    created: number;
    won: number;
    value: number;
  }>;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspace_id");
    
    if (workspaceId) {
      // Generate analytics for a specific workspace
      const result = await generateAnalyticsForWorkspace(workspaceId);
      return new Response(
        JSON.stringify({ ok: true, workspace_id: workspaceId, ...result }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Generate analytics for all workspaces with deals
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id")
      .limit(100);

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
      return new Response(
        JSON.stringify({ ok: false, error: workspacesError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const workspace of workspaces || []) {
      try {
        await generateAnalyticsForWorkspace(workspace.id);
        processed++;
      } catch (e) {
        console.error(`Error processing workspace ${workspace.id}:`, e);
        errors.push(`Workspace ${workspace.id}: ${String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("Error in generate-deal-analytics:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function generateAnalyticsForWorkspace(workspaceId: string): Promise<{ updated: boolean }> {
  // ============================================================================
  // A. Query all deals for workspace
  // ============================================================================
  
  const { data: deals, error: dealsError } = await supabase
    .from("deals")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (dealsError) {
    throw new Error(`Error fetching deals: ${dealsError.message}`);
  }

  if (!deals || deals.length === 0) {
    // Still create a snapshot with empty data
    const emptyData: DealAnalyticsData = {
      totals: {
        open_value: 0,
        forecast_value: 0,
        won_value: 0,
        lost_value: 0,
        open_deals: 0,
        won_deals: 0,
        lost_deals: 0,
      },
      by_stage: [],
      stage_conversion: {},
      velocity: {},
      owner_splits: [],
      deal_sources: [],
    };

    await supabase.from("deal_analytics").insert({
      workspace_id: workspaceId,
      data: emptyData,
      generated_at: new Date().toISOString(),
    });

    return { updated: true };
  }

  const now = new Date();

  // ============================================================================
  // B. Compute totals
  // ============================================================================

  const openDeals = deals.filter((d) => !d.stage.startsWith("closed_"));
  const wonDeals = deals.filter((d) => d.stage === "closed_won");
  const lostDeals = deals.filter((d) => d.stage === "closed_lost");

  const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const lostValue = lostDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  // Forecast value = sum of (value * probability / 100)
  const forecastValue = openDeals.reduce(
    (sum, d) => sum + ((d.value || 0) * (d.probability || 0)) / 100,
    0
  );

  // ============================================================================
  // C. Group by stage → compute avg age
  // ============================================================================

  const stageGroups: Record<string, { deals: any[]; totalValue: number; totalAge: number }> = {};

  for (const deal of deals) {
    if (!stageGroups[deal.stage]) {
      stageGroups[deal.stage] = { deals: [], totalValue: 0, totalAge: 0 };
    }
    stageGroups[deal.stage].deals.push(deal);
    stageGroups[deal.stage].totalValue += deal.value || 0;

    // Age = now - updated_at or created_at if no updates
    const ageMs = now.getTime() - new Date(deal.updated_at || deal.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    stageGroups[deal.stage].totalAge += ageDays;
  }

  const byStage = Object.entries(stageGroups).map(([stage, group]) => ({
    stage,
    count: group.deals.length,
    value: group.totalValue,
    avg_age_days: group.deals.length > 0 ? group.totalAge / group.deals.length : 0,
  }));

  // ============================================================================
  // D. Stage Conversion (from deal_activity)
  // ============================================================================

  const dealIds = deals.map((d) => d.id);
  const { data: stageChanges, error: stageChangesError } = await supabase
    .from("deal_activity")
    .select("deal_id, metadata, created_at")
    .in("deal_id", dealIds)
    .eq("type", "stage_change")
    .order("created_at", { ascending: true });

  if (stageChangesError) {
    console.warn(`Error fetching stage changes: ${stageChangesError.message}`);
  }

  // Count transitions
  const transitions: Record<string, number> = {};
  for (const change of stageChanges || []) {
    const meta = change.metadata || {};
    const fromStage = meta.old_stage || meta.from_stage;
    const toStage = meta.new_stage || meta.to_stage;
    if (fromStage && toStage && fromStage !== toStage) {
      const key = `${fromStage} → ${toStage}`;
      transitions[key] = (transitions[key] || 0) + 1;
    }
  }

  // Calculate conversion rates
  const stageConversion: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};

  // Count deals entering each stage
  for (const change of stageChanges || []) {
    const meta = change.metadata || {};
    const fromStage = meta.old_stage || meta.from_stage;
    if (fromStage) {
      stageCounts[fromStage] = (stageCounts[fromStage] || 0) + 1;
    }
  }

  // Calculate conversion rates
  for (const [transition, count] of Object.entries(transitions)) {
    const [fromStage] = transition.split(" → ");
    const totalFromStage = stageCounts[fromStage] || deals.filter((d) => d.stage === fromStage).length;
    if (totalFromStage > 0) {
      stageConversion[transition] = count / totalFromStage;
    }
  }

  // ============================================================================
  // E. Velocity (average days in each stage)
  // ============================================================================

  const velocity: Record<string, number> = {};
  const stageDurations: Record<string, number[]> = {};

  // For each deal, track time spent in each stage
  for (const deal of deals) {
    const dealStageChanges = (stageChanges || []).filter((sc) => sc.deal_id === deal.id);

    // Simplified: use deal's current stage and time since last update
    if (deal.stage && !deal.stage.startsWith("closed_")) {
      const timeInStage = (now.getTime() - new Date(deal.updated_at || deal.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (!stageDurations[deal.stage]) {
        stageDurations[deal.stage] = [];
      }
      stageDurations[deal.stage].push(timeInStage);
    }
  }

  // Calculate average duration per stage
  for (const [stage, durations] of Object.entries(stageDurations)) {
    if (durations.length > 0) {
      velocity[stage] = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
  }

  // More accurate velocity calculation using deal_activity
  const dealStageHistory: Record<string, Array<{ stage: string; entered_at: Date; left_at?: Date }>> = {};
  
  for (const deal of deals) {
    const dealActivities = (stageChanges || []).filter((sc) => sc.deal_id === deal.id);

    // Get deal creation time
    const createdAt = new Date(deal.created_at);
    let currentStage = "new"; // Start with initial stage
    let stageEnteredAt = createdAt;

    // Sort stage changes by time
    const sortedChanges = dealActivities
      .map((sc) => ({
        from: sc.metadata?.old_stage || sc.metadata?.from_stage,
        to: sc.metadata?.new_stage || sc.metadata?.to_stage,
        at: new Date(sc.created_at),
      }))
      .filter((c) => c.from && c.to)
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    // Track initial stage if no changes recorded
    if (sortedChanges.length === 0) {
      currentStage = deal.stage || "new";
    } else {
      // Process stage changes
      for (const change of sortedChanges) {
        // Record time in previous stage before moving
        if (change.from && change.from !== currentStage) {
          if (!dealStageHistory[change.from]) {
            dealStageHistory[change.from] = [];
          }
          dealStageHistory[change.from].push({
            stage: change.from,
            entered_at: stageEnteredAt,
            left_at: change.at,
          });
        }
        currentStage = change.to || currentStage;
        stageEnteredAt = change.at;
      }
    }

    // Current stage (if not closed)
    if (!currentStage.startsWith("closed_")) {
      if (!dealStageHistory[currentStage]) {
        dealStageHistory[currentStage] = [];
      }
      dealStageHistory[currentStage].push({
        stage: currentStage,
        entered_at: stageEnteredAt,
        left_at: undefined,
      });
    }
  }

  // Recalculate velocity from history
  const velocityRecalc: Record<string, number[]> = {};
  for (const [stage, histories] of Object.entries(dealStageHistory)) {
    for (const history of histories) {
      const leftAt = history.left_at || now;
      const duration = (leftAt.getTime() - history.entered_at.getTime()) / (1000 * 60 * 60 * 24);
      if (!velocityRecalc[stage]) {
        velocityRecalc[stage] = [];
      }
      velocityRecalc[stage].push(duration);
    }
  }

  const velocityFinal: Record<string, number> = {};
  for (const [stage, durations] of Object.entries(velocityRecalc)) {
    if (durations.length > 0) {
      velocityFinal[stage] = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
  }

  // ============================================================================
  // F. Owner Dashboard Stats
  // ============================================================================

  const ownerGroups: Record<string, { deals: any[]; wonDeals: any[] }> = {};
  const ownerNames: Record<string, string> = {};

  for (const deal of deals) {
    const ownerId = deal.owner_id || "unassigned";
    if (!ownerGroups[ownerId]) {
      ownerGroups[ownerId] = { deals: [], wonDeals: [] };
    }
    ownerGroups[ownerId].deals.push(deal);
    if (deal.stage === "closed_won") {
      ownerGroups[ownerId].wonDeals.push(deal);
    }
  }

  // Get owner names from team_members or workspace_members
  const ownerIds = Object.keys(ownerGroups).filter((id) => id !== "unassigned");
  if (ownerIds.length > 0) {
    // Try to get names from team_members
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("user_id, email")
      .in("user_id", ownerIds)
      .eq("workspace_id", workspaceId);

    for (const member of teamMembers || []) {
      ownerNames[member.user_id] = member.email || "Unknown";
    }

    // Fill in any missing names
    for (const ownerId of ownerIds) {
      if (!ownerNames[ownerId]) {
        ownerNames[ownerId] = "Unknown User";
      }
    }
  }

  const ownerSplits = Object.entries(ownerGroups).map(([ownerId, group]) => {
    const openDeals = group.deals.filter((d) => !d.stage.startsWith("closed_"));
    const wonDeals = group.wonDeals;
    const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    const wonValue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);

    // Calculate average velocity for this owner's deals
    const ownerDealIds = group.deals.map((d) => d.id);
    const ownerStageChanges = (stageChanges || []).filter((sc) => ownerDealIds.includes(sc.deal_id));

    // Simplified velocity calculation
    const avgVelocity = openDeals.length > 0
      ? openDeals.reduce((sum, d) => {
          const age = (now.getTime() - new Date(d.updated_at || d.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + age;
        }, 0) / openDeals.length
      : 0;

    return {
      owner_id: ownerId,
      name: ownerNames[ownerId] || (ownerId === "unassigned" ? "Unassigned" : "Unknown"),
      open_deals: openDeals.length,
      open_value: openValue,
      won_deals: wonDeals.length,
      won_value: wonValue,
      avg_velocity_days: avgVelocity,
    };
  });

  // ============================================================================
  // G. Source Attribution
  // ============================================================================

  // Get deals with lead_ids
  const leadIds = deals.map((d) => d.lead_id).filter(Boolean);
  const dealSources: Record<string, { campaign_id: string; name: string; created: number; won: number; value: number }> = {};

  if (leadIds.length > 0) {
    // Get campaign_leads to map leads to campaigns
    const { data: campaignLeads } = await supabase
      .from("campaign_leads")
      .select("campaign_id, lead_id")
      .in("lead_id", leadIds);

    // Get campaign names
    const campaignIds = [...new Set((campaignLeads || []).map((cl) => cl.campaign_id).filter(Boolean))];
    const campaignMap: Record<string, string> = {};

    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, name")
        .in("id", campaignIds);

      for (const campaign of campaigns || []) {
        campaignMap[campaign.id] = campaign.name || "Unknown Campaign";
      }
    }

    // Map deals to campaigns
    const leadToCampaign: Record<string, string> = {};
    for (const cl of campaignLeads || []) {
      if (cl.lead_id && cl.campaign_id) {
        leadToCampaign[cl.lead_id] = cl.campaign_id;
      }
    }

    // Aggregate by campaign
    for (const deal of deals) {
      if (deal.lead_id && leadToCampaign[deal.lead_id]) {
        const campaignId = leadToCampaign[deal.lead_id];
        if (!dealSources[campaignId]) {
          dealSources[campaignId] = {
            campaign_id: campaignId,
            name: campaignMap[campaignId] || "Unknown Campaign",
            created: 0,
            won: 0,
            value: 0,
          };
        }
        dealSources[campaignId].created++;
        if (deal.stage === "closed_won") {
          dealSources[campaignId].won++;
          dealSources[campaignId].value += deal.value || 0;
        }
      }
    }
  }

  const dealSourcesArray = Object.values(dealSources);

  // ============================================================================
  // Build analytics data structure
  // ============================================================================

  const analyticsData: DealAnalyticsData = {
    totals: {
      open_value: openValue,
      forecast_value: forecastValue,
      won_value: wonValue,
      lost_value: lostValue,
      open_deals: openDeals.length,
      won_deals: wonDeals.length,
      lost_deals: lostDeals.length,
    },
    by_stage: byStage,
    stage_conversion: stageConversion,
    velocity: velocityFinal,
    owner_splits: ownerSplits,
    deal_sources: dealSourcesArray,
  };

  // ============================================================================
  // Save snapshot
  // ============================================================================

  const { error: insertError } = await supabase.from("deal_analytics").insert({
    workspace_id: workspaceId,
    data: analyticsData,
    generated_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new Error(`Error inserting analytics: ${insertError.message}`);
  }

  // Log team activity
  try {
    await supabase.rpc("log_team_activity", {
      p_workspace_id: workspaceId,
      p_type: "deal_analytics_refreshed",
      p_title: "Deal Analytics Refreshed",
      p_body: `Analytics snapshot generated with ${deals.length} deals`,
      p_metadata: { deals_count: deals.length },
    });
  } catch (e) {
    console.warn("Failed to log team activity:", e);
  }

  return { updated: true };
}

