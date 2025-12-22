// Block 21889 — SmartSend Roofing Missed Opportunity Detector v1
// Edge Function: Compute Risk Score
// Runs every 10 minutes automatically to detect jobs at risk

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface RiskFactors {
  probabilityDrop: number;
  missedFollowups: number;
  hotLeadNotContacted: boolean;
  proposalOverdueHours: number | null;
  estimatorInactivityHours: number | null;
  highValueNeglect: boolean;
  negativeTone: string | null;
  stuckInStageHours: number | null;
}

Deno.serve(async (req) => {
  // Allow POST and GET (GET for cron triggers)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    console.log("Starting risk score computation...");

    // Get all active leads (not won/lost)
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        workspace_id,
        status,
        heat_score,
        job_probability,
        previous_job_probability,
        estimated_job_value,
        homeowner_tone,
        stage_entered_at,
        last_estimator_activity_at,
        proposal_due_at,
        last_homeowner_message_at,
        updated_at,
        created_at,
        estimator_id
      `)
      .not("status", "in", ["won", "lost"]);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return new Response(
        JSON.stringify({ error: leadsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No active leads to process" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${leads.length} leads...`);

    const now = new Date();
    let processed = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;

    // Group leads by workspace to batch settings lookups
    const workspaceIds = [...new Set(leads.map(l => l.workspace_id))];
    const settingsMap = new Map<string, any>();

    // Fetch automation settings for all workspaces
    for (const workspaceId of workspaceIds) {
      const { data: settings } = await supabase
        .from("automation_settings")
        .select("risk_engine_enabled, alert_on_high_risk, alert_on_critical_risk, alert_via_email, alert_via_sms, alert_via_inapp")
        .eq("workspace_id", workspaceId)
        .single();
      
      settingsMap.set(workspaceId, settings || { risk_engine_enabled: true });
    }

    // Process each lead
    for (const lead of leads) {
      const settings = settingsMap.get(lead.workspace_id) || { risk_engine_enabled: true };
      
      // Skip if risk engine is disabled for this workspace
      if (!settings.risk_engine_enabled) {
        console.log(`Risk engine disabled for workspace ${lead.workspace_id}, skipping lead ${lead.id}`);
        continue;
      }
      const riskFactors = await calculateRiskFactors(lead, now);
      const { score, category } = calculateRiskScore(riskFactors);

      // Update lead with risk score
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          risk_score: score,
          risk_category: category,
          last_risk_update: now.toISOString(),
          previous_job_probability: lead.job_probability || null,
        })
        .eq("id", lead.id);

      if (updateError) {
        console.error(`Error updating lead ${lead.id}:`, updateError);
        continue;
      }

      // Add to timeline
      await supabase.from("job_timelines").insert({
        lead_id: lead.id,
        event_type: "risk_updated",
        event_data: {
          score,
          category,
          factors: riskFactors,
        },
      }).catch((err) => {
        console.error(`Error logging timeline for lead ${lead.id}:`, err);
      });

      // Track counts
      if (category === "critical") criticalCount++;
      else if (category === "high") highCount++;
      else if (category === "medium") mediumCount++;

      processed++;

      // Trigger automated save actions for critical risk
      if (category === "critical") {
        await triggerCriticalRiskActions(lead, riskFactors, score).catch((err) => {
          console.error(`Error triggering actions for lead ${lead.id}:`, err);
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        summary: {
          critical: criticalCount,
          high: highCount,
          medium: mediumCount,
          low: processed - criticalCount - highCount - mediumCount,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error in compute-risk-score:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function calculateRiskFactors(lead: any, now: Date): Promise<RiskFactors> {
  const factors: RiskFactors = {
    probabilityDrop: 0,
    missedFollowups: 0,
    hotLeadNotContacted: false,
    proposalOverdueHours: null,
    estimatorInactivityHours: null,
    highValueNeglect: false,
    negativeTone: null,
    stuckInStageHours: null,
  };

  // 1. Probability Drop
  if (lead.job_probability !== null && lead.previous_job_probability !== null) {
    factors.probabilityDrop = lead.previous_job_probability - lead.job_probability;
  }

  // 2. Missed Follow-ups
  const { count: missedCount } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", lead.id)
    .not("status", "in", ["done", "completed"])
    .lt("due_at", now.toISOString());

  factors.missedFollowups = missedCount || 0;

  // 3. Hot Lead Not Contacted (heat_score >= 80 and no estimator reply in 10 minutes)
  if (lead.heat_score >= 80) {
    const lastActivity = lead.last_estimator_activity_at
      ? new Date(lead.last_estimator_activity_at)
      : null;
    if (!lastActivity || (now.getTime() - lastActivity.getTime()) > 10 * 60 * 1000) {
      factors.hotLeadNotContacted = true;
    }
  }

  // 4. Proposal Overdue
  if (lead.proposal_due_at) {
    const dueDate = new Date(lead.proposal_due_at);
    const hoursOverdue = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
    if (hoursOverdue > 0) {
      factors.proposalOverdueHours = hoursOverdue;
    }
  }

  // 5. Estimator Inactivity
  if (lead.last_estimator_activity_at) {
    const lastActivity = new Date(lead.last_estimator_activity_at);
    const hoursInactive = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    factors.estimatorInactivityHours = hoursInactive;
  } else if (lead.created_at) {
    // If never contacted, use created_at
    const created = new Date(lead.created_at);
    const hoursInactive = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    factors.estimatorInactivityHours = hoursInactive;
  }

  // 6. High-Value Lead Neglect (value >= $10,000 and no activity in 24 hours)
  if (lead.estimated_job_value && lead.estimated_job_value >= 10000) {
    const lastActivity = lead.last_estimator_activity_at
      ? new Date(lead.last_estimator_activity_at)
      : lead.updated_at
      ? new Date(lead.updated_at)
      : null;
    if (lastActivity) {
      const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      if (hoursSinceActivity >= 24) {
        factors.highValueNeglect = true;
      }
    }
  }

  // 7. Negative Tone
  if (lead.homeowner_tone && ["angry", "impatient", "confused"].includes(lead.homeowner_tone)) {
    factors.negativeTone = lead.homeowner_tone;
  }

  // 8. Stuck in Pipeline Stage
  if (lead.stage_entered_at) {
    const stageEntered = new Date(lead.stage_entered_at);
    const hoursInStage = (now.getTime() - stageEntered.getTime()) / (1000 * 60 * 60);
    factors.stuckInStageHours = hoursInStage;
  } else if (lead.updated_at) {
    // Fallback to updated_at if stage_entered_at not set
    const updated = new Date(lead.updated_at);
    const hoursInStage = (now.getTime() - updated.getTime()) / (1000 * 60 * 60);
    factors.stuckInStageHours = hoursInStage;
  }

  return factors;
}

function calculateRiskScore(factors: RiskFactors): { score: number; category: string } {
  let score = 0;

  // 1. Probability Drop (HIGH weight)
  if (factors.probabilityDrop >= 30) score += 40;
  else if (factors.probabilityDrop >= 15) score += 25;

  // 2. Missed Follow-ups
  if (factors.missedFollowups >= 2) score += 30;
  else if (factors.missedFollowups >= 1) score += 15;

  // 3. Hot Lead Not Contacted
  if (factors.hotLeadNotContacted) score += 30;

  // 4. Proposal Overdue
  if (factors.proposalOverdueHours !== null) {
    if (factors.proposalOverdueHours >= 48) score += 40;
    else if (factors.proposalOverdueHours >= 24) score += 20;
  }

  // 5. Estimator Inactivity
  if (factors.estimatorInactivityHours !== null) {
    if (factors.estimatorInactivityHours >= 12) score += 40;
    else if (factors.estimatorInactivityHours >= 6) score += 20;
  }

  // 6. High-Value Lead Neglect
  if (factors.highValueNeglect) score += 30;

  // 7. Negative Tone
  if (factors.negativeTone === "angry") score += 40;
  else if (factors.negativeTone === "impatient") score += 25;
  else if (factors.negativeTone === "confused") score += 10;

  // 8. Stuck in Pipeline Stage
  if (factors.stuckInStageHours !== null) {
    if (factors.stuckInStageHours >= 72) score += 30;
    else if (factors.stuckInStageHours >= 48) score += 15;
  }

  // Clamp to 0-100
  score = Math.min(100, Math.max(0, score));

  // Determine category
  let category: string;
  if (score >= 80) category = "critical";
  else if (score >= 50) category = "high";
  else if (score >= 20) category = "medium";
  else category = "low";

  return { score, category };
}

async function triggerCriticalRiskActions(
  lead: any,
  factors: RiskFactors,
  score: number
): Promise<void> {
  console.log(`Triggering critical risk actions for lead ${lead.id} (score: ${score})`);

  // 1. Send notification to owner
  await notifyOwner(lead, factors, score);

  // 2. Send forced follow-up message to homeowner (if applicable)
  // This would integrate with your messaging system
  // await sendFollowUpMessage(lead);

  // 3. Auto-handoff to another estimator (if current estimator is failing)
  if (factors.estimatorInactivityHours && factors.estimatorInactivityHours >= 12 && lead.estimator_id) {
    await handoffToAnotherEstimator(lead, factors);
  }

  // 4. Estimator alert (if estimator assigned)
  if (lead.estimator_id) {
    await alertEstimator(lead, factors, score);
  }
}

async function notifyOwner(lead: any, factors: RiskFactors, score: number): Promise<void> {
  // Get workspace owner
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", lead.workspace_id)
    .single();

  if (!workspace || !workspace.owner_id) {
    console.log(`No owner found for workspace ${lead.workspace_id}`);
    return;
  }

  // Build notification message
  const reasons: string[] = [];
  if (factors.probabilityDrop >= 30) reasons.push(`Probability dropped ${factors.probabilityDrop} points`);
  if (factors.missedFollowups >= 2) reasons.push(`${factors.missedFollowups} missed follow-ups`);
  if (factors.hotLeadNotContacted) reasons.push("Hot lead not contacted in 10 minutes");
  if (factors.proposalOverdueHours && factors.proposalOverdueHours >= 48) {
    reasons.push(`Proposal ${Math.round(factors.proposalOverdueHours)} hours overdue`);
  }
  if (factors.estimatorInactivityHours && factors.estimatorInactivityHours >= 12) {
    reasons.push(`No estimator reply in ${Math.round(factors.estimatorInactivityHours)} hours`);
  }
  if (factors.highValueNeglect) {
    const value = lead.estimated_job_value
      ? `$${Number(lead.estimated_job_value).toLocaleString()}`
      : "$10,000+";
    reasons.push(`High-value job (${value}) neglected`);
  }
  if (factors.negativeTone) reasons.push(`Homeowner tone: ${factors.negativeTone}`);
  if (factors.stuckInStageHours && factors.stuckInStageHours >= 72) {
    reasons.push(`Stuck in ${lead.status} for ${Math.round(factors.stuckInStageHours)} hours`);
  }

  const reasonText = reasons.length > 0 ? reasons.join(", ") : "Multiple risk factors detected";
  const jobValue = lead.estimated_job_value
    ? `$${Number(lead.estimated_job_value).toLocaleString()}`
    : "unknown value";

  const title = `🚨 CRITICAL: ${jobValue} job at risk`;
  const message = `${lead.name || "Lead"} — ${reasonText}. Risk score: ${score}/100.`;

  // Create alert/notification
  try {
    // Try to use the alerts API if available
    await supabase.rpc("create_alert", {
      p_workspace_id: lead.workspace_id,
      p_user_id: workspace.owner_id,
      p_type: "performance_insights",
      p_title: title,
      p_message: message,
      p_contact_id: null,
      p_campaign_id: null,
      p_appointment_id: null,
      p_metadata: {
        lead_id: lead.id,
        risk_score: score,
        risk_factors: factors,
      },
      p_source: "missed_opportunity_detector",
    });
  } catch (err) {
    console.error("Error creating alert:", err);
    // Fallback: log to job_timelines
    await supabase.from("job_timelines").insert({
      lead_id: lead.id,
      event_type: "critical_risk_alert",
      event_data: {
        title,
        message,
        risk_score: score,
        factors,
      },
    });
  }
}

async function handoffToAnotherEstimator(lead: any, factors: RiskFactors): Promise<void> {
  try {
    // Use the perform_lead_handoff function
    const { data, error } = await supabase.rpc("perform_lead_handoff", {
      p_lead_id: lead.id,
      p_new_owner_id: null, // Let the function pick the best estimator
      p_reason: "critical_risk_estimator_inactivity",
      p_handoff_by: null, // System-initiated
    });

    if (error) {
      console.error(`Error handing off lead ${lead.id}:`, error);
      return;
    }

    // Log to timeline
    await supabase.from("job_timelines").insert({
      lead_id: lead.id,
      event_type: "auto_handoff",
      event_data: {
        reason: "Critical risk: estimator inactivity",
        previous_estimator_id: lead.estimator_id,
        factors,
      },
    });
  } catch (err) {
    console.error(`Error in handoffToAnotherEstimator for lead ${lead.id}:`, err);
  }
}

async function alertEstimator(lead: any, factors: RiskFactors, score: number): Promise<void> {
  try {
    // Get estimator profile
    const { data: estimator } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", lead.estimator_id)
      .single();

    if (!estimator) {
      return;
    }

    // Build alert message
    const reasons: string[] = [];
    if (factors.estimatorInactivityHours && factors.estimatorInactivityHours >= 12) {
      reasons.push(`No reply in ${Math.round(factors.estimatorInactivityHours)} hours`);
    }
    if (factors.missedFollowups >= 2) {
      reasons.push(`${factors.missedFollowups} missed follow-ups`);
    }
    if (factors.proposalOverdueHours && factors.proposalOverdueHours >= 24) {
      reasons.push(`Proposal ${Math.round(factors.proposalOverdueHours)} hours overdue`);
    }

    const reasonText = reasons.length > 0 ? reasons.join(", ") : "Multiple risk factors";
    const title = "URGENT: Hot lead requires immediate action";
    const message = `${lead.name || "Lead"} — ${reasonText}. Risk score: ${score}/100.`;

    // Create notification for estimator
    await supabase.rpc("create_alert", {
      p_workspace_id: lead.workspace_id,
      p_user_id: lead.estimator_id,
      p_type: "performance_insights",
      p_title: title,
      p_message: message,
      p_contact_id: null,
      p_campaign_id: null,
      p_appointment_id: null,
      p_metadata: {
        lead_id: lead.id,
        risk_score: score,
        risk_factors: factors,
      },
      p_source: "missed_opportunity_detector",
    }).catch((err) => {
      console.error(`Error creating estimator alert:`, err);
      // Fallback: log to timeline
      supabase.from("job_timelines").insert({
        lead_id: lead.id,
        event_type: "estimator_alert",
        event_data: {
          title,
          message,
          estimator_id: lead.estimator_id,
        },
      });
    });
  } catch (err) {
    console.error(`Error in alertEstimator for lead ${lead.id}:`, err);
  }
}

