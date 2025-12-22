import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/insights/update
 * Background worker endpoint to update all insights cache
 * Should be called by cron job or scheduled task
 * 
 * Requires Authorization header with service role key or API key
 */
export async function POST(req: NextRequest) {
  try {
    // Verify authorization (service role or API key)
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!authHeader || !authHeader.includes(serviceKey || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace_id } = await req.json().catch(() => ({}));
    
    // If workspace_id provided, update only that workspace
    // Otherwise, update all workspaces
    const workspaces = workspace_id
      ? [{ id: workspace_id }]
      : (await supabaseAdmin.from("workspaces").select("id")).data || [];

    const results = [];

    for (const workspace of workspaces) {
      try {
        // Update each insights table
        await Promise.all([
          updateLeadInsights(workspace.id),
          updateStormInsights(workspace.id),
          updateInsuranceInsights(workspace.id),
          updateReplyMetrics(workspace.id),
          updateConversionInsights(workspace.id),
          updateCampaignInsights(workspace.id),
          updateAppointmentMetrics(workspace.id),
          updateTimelineInsights(workspace.id),
          updateDangerReport(workspace.id),
        ]);

        results.push({ workspace_id: workspace.id, status: "success" });
      } catch (error: any) {
        results.push({
          workspace_id: workspace.id,
          status: "error",
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      updated: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Update insights error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper functions to update each insights table
async function updateLeadInsights(workspaceId: string) {
  // Get lead heat scores
  const { data: heatScores } = await supabaseAdmin
    .from("lead_heat_scores")
    .select("heat_score, heat_level")
    .eq("workspace_id", workspaceId);

  const avgHeat =
    heatScores?.reduce((sum, h) => sum + (h.heat_score || 0), 0) / (heatScores?.length || 1) || 0;
  const hotCount = heatScores?.filter((h) => h.heat_level === "hot").length || 0;
  const warmCount = heatScores?.filter((h) => h.heat_level === "warm").length || 0;
  const coldCount = heatScores?.filter((h) => h.heat_level === "cold").length || 0;

  // Get contacts needing reply (replied but not responded to)
  const { count: needsReply } = await supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("pipeline_stage_key", "hot_leads");

  // Get neglected leads (no activity in 48+ hours)
  const { count: neglected } = await supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .lt("updated_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

  // Get high-value leads
  const { count: highValue } = await supabaseAdmin
    .from("lead_auto_follow_up_stats")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gt("potential_job_value", 5000);

  // Get insurance leads
  const { count: insuranceLeads } = await supabaseAdmin
    .from("insurance_metadata")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("has_insurance_claim", true);

  // Upsert insights
  await supabaseAdmin
    .from("insights_leads")
    .upsert({
      workspace_id: workspaceId,
      avg_lead_heat: avgHeat,
      hot_leads_count: hotCount,
      warm_leads_count: warmCount,
      cold_leads_count: coldCount,
      leads_needing_reply: needsReply || 0,
      neglected_leads: neglected || 0,
      high_value_leads: highValue || 0,
      insurance_leads_count: insuranceLeads || 0,
      calculated_at: new Date().toISOString(),
    });
}

async function updateStormInsights(workspaceId: string) {
  // Get recent storm events
  const { data: storms } = await supabaseAdmin
    .from("weather_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("storm_started_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order("storm_started_at", { ascending: false });

  const affectedZips = [...new Set(storms?.map((s) => s.zip) || [])];
  const hailSizes = storms?.map((s) => Number(s.hail_size || 0)).filter((h) => h > 0) || [];
  const windSpeeds = storms?.map((s) => Number(s.wind_speed || 0)).filter((w) => w > 0) || [];

  // Get storm-affected contacts
  const { count: stormHomes } = await supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("zip", affectedZips);

  await supabaseAdmin.from("insights_storm").upsert({
    workspace_id: workspaceId,
    storm_affected_zips: affectedZips,
    total_storm_homes: stormHomes || 0,
    hail_sizes: hailSizes,
    wind_speeds: windSpeeds,
    max_hail_size: hailSizes.length > 0 ? Math.max(...hailSizes) : null,
    max_wind_speed: windSpeeds.length > 0 ? Math.max(...windSpeeds) : null,
    calculated_at: new Date().toISOString(),
  });
}

async function updateInsuranceInsights(workspaceId: string) {
  const { data: insurance } = await supabaseAdmin
    .from("insurance_metadata")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("has_insurance_claim", true);

  const filedCount = insurance?.filter((i) => i.claim_status === "filed").length || 0;
  const pendingCount = insurance?.filter((i) => i.claim_status === "pending").length || 0;
  const approvedCount = insurance?.filter((i) => i.claim_status === "approved").length || 0;

  await supabaseAdmin.from("insights_insurance").upsert({
    workspace_id: workspaceId,
    insurance_interest_leads: insurance?.length || 0,
    filed_claims_count: filedCount,
    pending_claims_count: pendingCount,
    approved_claims_count: approvedCount,
    adjuster_scheduled_leads: insurance?.filter((i) => i.adjuster_scheduled_at).length || 0,
    calculated_at: new Date().toISOString(),
  });
}

async function updateReplyMetrics(workspaceId: string) {
  // This would need email_events table data
  // Simplified version
  await supabaseAdmin.from("insights_reply_metrics").upsert({
    workspace_id: workspaceId,
    calculated_at: new Date().toISOString(),
  });
}

async function updateConversionInsights(workspaceId: string) {
  // Get contacts by pipeline stage
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, pipeline_stage_key, moved_to_stage_at")
    .eq("workspace_id", workspaceId);

  const stageCounts: Record<string, number> = {};
  contacts?.forEach((c) => {
    const stage = c.pipeline_stage_key || "new_leads";
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });

  await supabaseAdmin.from("insights_conversions").upsert({
    workspace_id: workspaceId,
    cold_to_warm_count: stageCounts.warm_leads || 0,
    warm_to_hot_count: stageCounts.hot_leads || 0,
    hot_to_appointment_count: stageCounts.appointment_booked || 0,
    appointment_to_quote_count: stageCounts.quote_sent || 0,
    quote_to_won_count: stageCounts.won || 0,
    calculated_at: new Date().toISOString(),
  });
}

async function updateCampaignInsights(workspaceId: string) {
  // Simplified - would need campaign performance data
  await supabaseAdmin.from("insights_campaigns").upsert({
    workspace_id: workspaceId,
    calculated_at: new Date().toISOString(),
  });
}

async function updateAppointmentMetrics(workspaceId: string) {
  const { data: bookings } = await supabaseAdmin
    .from("schedule_bookings")
    .select("*")
    .eq("workspace_id", workspaceId);

  const totalBookings = bookings?.length || 0;
  const noShows = bookings?.filter((b) => b.status === "no_show").length || 0;
  const bookingRate = totalBookings > 0 ? (totalBookings - noShows) / totalBookings : 0;

  await supabaseAdmin.from("insights_appointment_metrics").upsert({
    workspace_id: workspaceId,
    booking_rate: bookingRate * 100,
    no_show_rate: (noShows / totalBookings) * 100 || 0,
    calculated_at: new Date().toISOString(),
  });
}

async function updateTimelineInsights(workspaceId: string) {
  await supabaseAdmin.from("insights_timeline").upsert({
    workspace_id: workspaceId,
    calculated_at: new Date().toISOString(),
  });
}

async function updateDangerReport(workspaceId: string) {
  const today = new Date().toISOString().split("T")[0];
  
  // Generate danger items (simplified)
  const dangerItems: any[] = [];

  // Hot leads not contacted
  const { data: hotLeads } = await supabaseAdmin
    .from("contacts")
    .select("id, email")
    .eq("workspace_id", workspaceId)
    .eq("pipeline_stage_key", "hot_leads")
    .lt("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(10);

  if (hotLeads && hotLeads.length > 0) {
    dangerItems.push({
      type: "hot_lead_not_contacted",
      count: hotLeads.length,
      priority: "high",
      items: hotLeads,
    });
  }

  await supabaseAdmin.from("insights_danger_report").upsert({
    workspace_id: workspaceId,
    report_date: today,
    danger_items: dangerItems,
    total_danger_items: dangerItems.length,
    high_priority_count: dangerItems.filter((d) => d.priority === "high").length,
    medium_priority_count: dangerItems.filter((d) => d.priority === "medium").length,
    low_priority_count: dangerItems.filter((d) => d.priority === "low").length,
    generated_at: new Date().toISOString(),
  });
}





















































