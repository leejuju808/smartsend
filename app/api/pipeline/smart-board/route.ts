// Block 22085 — SmartSend Roofing Smart Pipeline Board v2 API
// GET /api/pipeline/smart-board
// Returns leads grouped by pipeline stages with ALL intelligence metrics
// Intelligently sorted by revenue-first priority logic

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

function computeJobSource(raw: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const source = (raw || "").trim();
  const s = source.toLowerCase();

  // Monopoly framing: SmartSend is the default foundation.
  const primary = "SmartSend Outreach";

  if (!source) return { primary, secondary: null };

  // Treat any outreach/campaign-driven source as "SmartSend Outreach" (no secondary needed)
  const isSmartSend =
    s.includes("smartsend") ||
    s.includes("cold email") ||
    s.includes("email outreach") ||
    s.includes("outreach") ||
    s.includes("campaign") ||
    s.includes("sequence") ||
    s.includes("follow-up") ||
    s.includes("autopilot");

  if (isSmartSend) return { primary, secondary: null };

  // Everything else becomes secondary context (referrals as bonus, ads as background noise, etc.)
  return { primary, secondary: source };
}

// Standard roofing pipeline stages
const PIPELINE_STAGES = [
  { key: "new_lead", label: "New Lead", position: 1 },
  { key: "contacted", label: "Contacted", position: 2 },
  { key: "inspection_scheduled", label: "Inspection Scheduled", position: 3 },
  { key: "inspection_complete", label: "Inspection Complete", position: 4 },
  { key: "proposal_sent", label: "Proposal Sent", position: 5 },
  { key: "negotiation", label: "Negotiation / Follow-Up", position: 6 },
  { key: "won", label: "Won", position: 7 },
  { key: "lost", label: "Lost", position: 8 },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch leads with all intelligence metrics from lead_health_view
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        name,
        first_name,
        last_name,
        email,
        phone,
        city,
        state,
        pipeline_stage,
        estimated_job_value,
        job_health_score,
        job_health_trend,
        momentum_score,
        homeowner_experience_score,
        risk_category,
        risk_score,
        job_probability,
        win_probability,
        win_probability_reason,
        lead_source,
        estimator_id,
        stage_entered_at,
        last_contact_at,
        last_reply_at,
        created_at,
        updated_at,
        is_hot,
        hot_reason,
        hot_score
      `)
      .eq("workspace_id", workspaceId)
      .not("pipeline_stage", "is", null);

    if (leadsError) {
      console.error("[Smart Pipeline Board] Error fetching leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    // Fetch additional data from lead_health_view for each lead
    const leadIds = (leads || []).map((l) => l.id);
    
    // Get health view data
    const { data: healthData } = await supabase
      .from("lead_health_view")
      .select("*")
      .in("lead_id", leadIds);

    const healthByLeadId = new Map();
    (healthData || []).forEach((h) => {
      healthByLeadId.set(h.lead_id, h);
    });

    // Check for Job Save events (at-risk jobs)
    const saveEventsByLeadId = new Map();
    if (leadIds.length > 0) {
      const { data: saveEvents } = await supabase
        .from("job_save_events")
        .select("lead_id, status, severity")
        .in("lead_id", leadIds)
        .eq("status", "active");

      (saveEvents || []).forEach((e) => {
        saveEventsByLeadId.set(e.lead_id, e);
      });
    }

    // Get estimator info (if estimators table exists)
    const estimatorIds = [
      ...new Set((leads || []).map((l) => l.estimator_id).filter(Boolean)),
    ];
    
    const estimatorsById = new Map();
    if (estimatorIds.length > 0) {
      const { data: estimators } = await supabase
        .from("estimators")
        .select("id, name, email")
        .in("id", estimatorIds);

      (estimators || []).forEach((e) => {
        estimatorsById.set(e.id, e);
      });
    }

    // Enrich leads with health data and calculate days in stage
    const enrichedLeads = (leads || []).map((lead) => {
      const health = healthByLeadId.get(lead.id);
      const saveEvent = saveEventsByLeadId.get(lead.id);
      const estimator = lead.estimator_id
        ? estimatorsById.get(lead.estimator_id)
        : null;

      // Calculate days in stage
      const daysInStage = lead.stage_entered_at
        ? Math.floor(
            (Date.now() - new Date(lead.stage_entered_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      // Calculate days since last contact
      const daysSinceLastContact = lead.last_contact_at
        ? Math.floor(
            (Date.now() - new Date(lead.last_contact_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : lead.last_reply_at
        ? Math.floor(
            (Date.now() - new Date(lead.last_reply_at).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;

      return {
        id: lead.id,
        homeowner_name:
          lead.name ||
          `${lead.first_name || ""} ${lead.last_name || ""}`.trim() ||
          lead.email?.split("@")[0] ||
          "Unknown",
        address: lead.city
          ? `${lead.city}${lead.state ? `, ${lead.state}` : ""}`
          : null,
        email: lead.email,
        phone: lead.phone,
        lead_source: lead.lead_source || "Unknown",
        job_source_primary: computeJobSource(lead.lead_source).primary,
        job_source_secondary: computeJobSource(lead.lead_source).secondary,
        pipeline_stage: lead.pipeline_stage || "new_lead",
        // Intelligence metrics
        job_health_score: lead.job_health_score ?? health?.momentum_score ?? 50,
        job_health_trend: lead.job_health_trend || "stable",
        momentum_score: lead.momentum_score ?? health?.momentum_score ?? 50,
        experience_score:
          lead.homeowner_experience_score ??
          health?.homeowner_experience_score ??
          50,
        risk_category: lead.risk_category || health?.risk_category || "low",
        risk_score: lead.risk_score ?? 0,
        estimated_value: lead.estimated_job_value ?? 0,
        probability: lead.job_probability ?? health?.job_probability ?? 0,
        win_probability: lead.win_probability ?? null, // Block 22192: Win Probability Engine v1
        win_probability_reason: lead.win_probability_reason ?? null, // Block 22192: Win Probability Engine v1
        // Estimator info
        estimator_id: lead.estimator_id,
        estimator_name: estimator?.name || estimator?.email || null,
        // Job Save status
        is_in_save_mode: !!saveEvent,
        save_severity: saveEvent?.severity || null,
        // Time metrics
        days_in_stage: daysInStage,
        days_since_last_contact: daysSinceLastContact,
        stage_entered_at: lead.stage_entered_at,
        last_contact_at: lead.last_contact_at,
        last_reply_at: lead.last_reply_at,
        created_at: lead.created_at,
        updated_at: lead.updated_at,
      };
    });

    // Group leads by pipeline stage
    const grouped: Record<string, typeof enrichedLeads> = {};
    PIPELINE_STAGES.forEach((stage) => {
      grouped[stage.key] = [];
    });

    enrichedLeads.forEach((lead) => {
      const stage = lead.pipeline_stage || "new_lead";
      if (grouped[stage]) {
        grouped[stage].push(lead);
      } else {
        grouped["new_lead"].push(lead);
      }
    });

    // Intelligent sorting: Revenue-first priority logic
    // Sort by: Health (desc) → Momentum (desc) → Experience (desc) → Risk (asc) → Value (desc) → Probability (desc)
    Object.keys(grouped).forEach((stageKey) => {
      grouped[stageKey].sort((a, b) => {
        // Primary: Job Health Score (descending)
        const healthDiff = (b.job_health_score || 0) - (a.job_health_score || 0);
        if (healthDiff !== 0) return healthDiff;

        // Secondary: Momentum Score (descending)
        const momentumDiff = (b.momentum_score || 0) - (a.momentum_score || 0);
        if (momentumDiff !== 0) return momentumDiff;

        // Tertiary: Experience Score (descending)
        const expDiff = (b.experience_score || 0) - (a.experience_score || 0);
        if (expDiff !== 0) return expDiff;

        // Risk (ascending - low risk at top)
        const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
        const riskDiff =
          (riskOrder[a.risk_category as keyof typeof riskOrder] || 0) -
          (riskOrder[b.risk_category as keyof typeof riskOrder] || 0);
        if (riskDiff !== 0) return riskDiff;

        // Value (descending)
        const valueDiff = (b.estimated_value || 0) - (a.estimated_value || 0);
        if (valueDiff !== 0) return valueDiff;

        // Probability (descending)
        return (b.probability || 0) - (a.probability || 0);
      });
    });

    // Calculate column header stats
    const columnStats = PIPELINE_STAGES.map((stage) => {
      const stageLeads = grouped[stage.key] || [];
      const total = stageLeads.length;
      const avgHealth =
        total > 0
          ? Math.round(
              stageLeads.reduce(
                (sum, l) => sum + (l.job_health_score || 0),
                0
              ) / total
            )
          : 0;
      const atRisk = stageLeads.filter(
        (l) => l.job_health_score !== null && l.job_health_score < 50
      ).length;
      const potentialRevenue = stageLeads.reduce(
        (sum, l) => sum + (l.estimated_value || 0),
        0
      );

      return {
        key: stage.key,
        label: stage.label,
        position: stage.position,
        total,
        avg_health: avgHealth,
        at_risk: atRisk,
        potential_revenue: potentialRevenue,
      };
    });

    return NextResponse.json({
      columns: columnStats,
      jobs_by_stage: grouped,
      total_jobs: enrichedLeads.length,
    });
  } catch (error: any) {
    console.error("[Smart Pipeline Board] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

