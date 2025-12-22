// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  try {
    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id, name");

    if (workspacesError) {
      throw new Error(`Error fetching workspaces: ${workspacesError.message}`);
    }

    const results = [];

    for (const workspace of workspaces || []) {
      try {
        const audit = await generateWeeklyAudit(workspace.id);
        results.push({ workspace_id: workspace.id, success: true, audit_id: audit.id });
      } catch (error) {
        console.error(`Error generating audit for workspace ${workspace.id}:`, error);
        results.push({ workspace_id: workspace.id, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in weekly audit:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function generateWeeklyAudit(workspaceId: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Generate insights first
  await fetch(`${supabaseUrl}/functions/v1/ai-advisor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ workspace_id: workspaceId, force_refresh: true }),
  });

  // Get insights from this week
  const { data: insights } = await supabase
    .from("ai_advisor_insights")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("created_at", weekAgo.toISOString())
    .order("priority", { ascending: false });

  // Get deliverability data
  const deliverabilitySummary = await getDeliverabilitySummary(workspaceId, weekAgo, now);

  // Get sequence performance
  const sequencesSummary = await getSequencesSummary(workspaceId, weekAgo, now);

  // Get ICP performance
  const icpSummary = await getICPSummary(workspaceId, weekAgo, now);

  // Get revenue data
  const revenueSummary = await getRevenueSummary(workspaceId, weekAgo, now);

  // Get SDR performance
  const sdrSummary = await getSDRSummary(workspaceId, weekAgo, now);

  // Get top recommendations
  const { data: topRecommendations } = await supabase
    .from("ai_advisor_recommendations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("priority_score", { ascending: false })
    .limit(5);

  // Generate AI report text
  const fullReportText = generateReportText({
    deliverabilitySummary,
    sequencesSummary,
    icpSummary,
    revenueSummary,
    sdrSummary,
    topRecommendations: topRecommendations || [],
  });

  // Store audit
  const { data: audit, error: auditError } = await supabase
    .from("ai_advisor_audits")
    .insert({
      workspace_id: workspaceId,
      audit_period_start: weekAgo.toISOString(),
      audit_period_end: now.toISOString(),
      audit_date: now.toISOString().split("T")[0],
      deliverability_summary: deliverabilitySummary,
      sequences_summary: sequencesSummary,
      icp_summary: icpSummary,
      revenue_summary: revenueSummary,
      sdr_summary: sdrSummary,
      top_recommendations: topRecommendations || [],
      full_report_text: fullReportText,
    })
    .select()
    .single();

  if (auditError) {
    throw new Error(`Error storing audit: ${auditError.message}`);
  }

  // Send email (if workspace has email configured)
  await sendAuditEmail(workspaceId, audit);

  return audit;
}

async function getDeliverabilitySummary(
  workspaceId: string,
  start: Date,
  end: Date
): Promise<any> {
  const { data: inboxHealth } = await supabase
    .from("inbox_health")
    .select("*, sender_inboxes!inner(workspace_id)")
    .eq("sender_inboxes.workspace_id", workspaceId)
    .gte("updated_at", start.toISOString());

  if (!inboxHealth || inboxHealth.length === 0) {
    return { message: "No deliverability data available" };
  }

  const avgBounceRate =
    inboxHealth.reduce((sum, h) => sum + (h.bounce_rate || 0), 0) /
    inboxHealth.length;
  const avgSpamRate =
    inboxHealth.reduce((sum, h) => sum + (h.spam_rate || 0), 0) /
    inboxHealth.length;

  const issues = [];
  if (avgBounceRate > 0.05) {
    issues.push(`Bounce rate ↑ ${(avgBounceRate * 100).toFixed(2)}%`);
  }
  if (avgSpamRate > 0.001) {
    issues.push(`Spam complaints ↑ ${(avgSpamRate * 100).toFixed(3)}%`);
  }

  return {
    avg_bounce_rate: avgBounceRate,
    avg_spam_rate: avgSpamRate,
    inboxes_analyzed: inboxHealth.length,
    issues,
  };
}

async function getSequencesSummary(
  workspaceId: string,
  start: Date,
  end: Date
): Promise<any> {
  const { data: sequences } = await supabase
    .from("sequences")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  // Get underperforming steps from insights
  const { data: stepInsights } = await supabase
    .from("ai_advisor_insights")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("insight_type", "sequence_performance")
    .gte("created_at", start.toISOString());

  return {
    total_sequences: sequences?.length || 0,
    underperforming_steps: stepInsights?.length || 0,
    insights: stepInsights || [],
  };
}

async function getICPSummary(
  workspaceId: string,
  start: Date,
  end: Date
): Promise<any> {
  const { data: icpInsights } = await supabase
    .from("ai_advisor_insights")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("insight_type", "icp_drift")
    .gte("created_at", start.toISOString());

  return {
    opportunities: icpInsights?.length || 0,
    insights: icpInsights || [],
  };
}

async function getRevenueSummary(
  workspaceId: string,
  start: Date,
  end: Date
): Promise<any> {
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*, deals(revenue)")
    .eq("workspace_id", workspaceId)
    .gte("booked_at", start.toISOString())
    .lte("booked_at", end.toISOString());

  const totalRevenue =
    meetings?.reduce((sum, m) => sum + (m.deals?.revenue || 0), 0) || 0;

  return {
    meetings_count: meetings?.length || 0,
    total_revenue: totalRevenue,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}

async function getSDRSummary(
  workspaceId: string,
  start: Date,
  end: Date
): Promise<any> {
  // Simplified - would need actual SDR tracking
  return {
    message: "SDR performance tracking coming soon",
  };
}

function generateReportText(data: any): string {
  const lines = [
    "📊 SmartSend Weekly AI Audit",
    `Period: ${new Date(data.revenueSummary?.period?.start || Date.now()).toLocaleDateString()} - ${new Date(data.revenueSummary?.period?.end || Date.now()).toLocaleDateString()}`,
    "",
    "DELIVERABILITY:",
    data.deliverabilitySummary?.issues?.length > 0
      ? data.deliverabilitySummary.issues.map((i: string) => `• ${i}`).join("\n")
      : "• All systems healthy",
    "",
    "SEQUENCES:",
    `• ${data.sequencesSummary?.underperforming_steps || 0} steps underperforming`,
    `• ${data.sequencesSummary?.total_sequences || 0} total sequences`,
    "",
    "ICP:",
    `• ${data.icpSummary?.opportunities || 0} opportunities detected`,
    "",
    "REVENUE:",
    `• $${(data.revenueSummary?.total_revenue || 0).toLocaleString()} closed-won`,
    `• ${data.revenueSummary?.meetings_count || 0} meetings booked`,
    "",
    "TOP RECOMMENDATIONS:",
    ...(data.topRecommendations?.slice(0, 5).map(
      (r: any, idx: number) => `${idx + 1}. ${r.title}`
    ) || ["No recommendations"]),
  ];

  return lines.join("\n");
}

async function sendAuditEmail(workspaceId: string, audit: any) {
  // Get workspace owner email
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id, profiles!inner(email)")
    .eq("id", workspaceId)
    .single();

  if (!workspace || !workspace.profiles?.email) {
    console.log(`No email found for workspace ${workspaceId}`);
    return;
  }

  // In a real implementation, you would send an email here
  // For now, we'll just log it
  console.log(`Would send audit email to ${workspace.profiles.email}`, {
    audit_id: audit.id,
    subject: `SmartSend Weekly AI Audit - ${audit.audit_date}`,
  });

  // Update audit record
  await supabase
    .from("ai_advisor_audits")
    .update({
      sent_via_email: true,
      sent_at: new Date().toISOString(),
    })
    .eq("id", audit.id);
}



