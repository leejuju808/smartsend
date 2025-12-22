// Block 74000 — SmartSend Roofing
// "Owner Command Center + Daily Money Dashboard" v1
// API Route: Get real-time dashboard metrics for owner command center

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user's workspace
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspace_id");

    let workspaceId: string | null = null;

    if (workspaceIdParam) {
      // Verify user has access to this workspace
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspaceIdParam)
        .eq("user_id", user.id)
        .single();

      if (member) {
        workspaceId = workspaceIdParam;
      }
    } else {
      // Get user's first workspace
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      workspaceId = member?.workspace_id || null;
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Fetch all dashboard data in parallel
    const [
      // 1. Money Today Overview
      projectedRevenueResult,
      activeJobsResult,
      hotLeadsResult,
      followupsDueTodayResult,

      // 2. Lead Overview
      newLeadsTodayResult,
      hotLeadsCountResult,
      warmLeadsCountResult,
      repliesTodayResult,
      conversionRateResult,

      // 3. Estimate Performance
      estimatesSentTodayResult,
      pendingEstimatesResult,
      pendingEstimatesValueResult,
      followupsDueResult,
      lastActivityResult,

      // 4. Job Pipeline
      scheduledJobsResult,
      inProductionJobsResult,
      delayedJobsResult,
      completedJobsResult,
      jobRevenueResult,

      // 5. Safety Snapshot
      ppeNonComplianceResult,
      toolboxTalkTodayResult,
      openIncidentsResult,
      criticalIncidentsResult,

      // 6. Smart Alerts
      hotLeadsNoEstimateResult,
      overdueFollowupsResult,
      jobsNoScheduleResult,
    ] = await Promise.all([
      // Money Today
      supabase
        .from("jobs")
        .select("contract_value")
        .in("stage", ["scheduled", "in_progress", "in_production", "approved"])
        .gte("created_at", todayStart)
        .then((r) => ({
          data: r.data?.reduce((sum, j) => sum + (Number(j.contract_value) || 0), 0) || 0,
          error: r.error,
        })),

      supabase
        .from("jobs")
        .select("id", { count: "exact" })
        .in("stage", ["scheduled", "in_progress", "in_production"])
        .then((r) => ({ data: r.count || 0, error: r.error })),

      supabase
        .from("leads")
        .select("id", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .or("is_hot.eq.true,pipeline_stage.eq.hot")
        .then((r) => ({ data: r.count || 0, error: r.error })),

      supabase
        .from("estimate_followups")
        .select("id", { count: "exact" })
        .eq("sent", false)
        .eq("due_date", today.toISOString().split("T")[0])
        .then((r) => ({ data: r.count || 0, error: r.error })),

      // Lead Overview
      supabase
        .from("leads")
        .select("id", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .then((r) => ({ data: r.count || 0, error: r.error })),

      supabase
        .from("leads")
        .select("id", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .or("is_hot.eq.true,pipeline_stage.eq.hot")
        .then((r) => ({ data: r.count || 0, error: r.error })),

      supabase
        .from("leads")
        .select("id", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .eq("pipeline_stage", "warm")
        .then((r) => ({ data: r.count || 0, error: r.error })),

      supabase
        .from("lead_replies")
        .select("id", { count: "exact" })
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd)
        .then((r) => ({ data: r.count || 0, error: r.error })),

      // Conversion rate: won jobs / estimates sent (last 30 days)
      supabase
        .from("estimates")
        .select("id, lead_id, sent_at")
        .not("sent_at", "is", null)
        .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .then(async (r) => {
          if (r.error) return { data: 0, error: r.error };
          const estimatesSent = r.data?.length || 0;
          if (estimatesSent === 0) return { data: 0, error: null };

          const leadIds = r.data?.map((e) => e.lead_id) || [];
          const { count: wonCount } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .in("id", leadIds)
            .eq("status", "won");

          return {
            data: wonCount ? (wonCount / estimatesSent) * 100 : 0,
            error: null,
          };
        }),

      // Estimate Performance
      supabase
        .from("estimates")
        .select("id", { count: "exact" })
        .gte("sent_at", todayStart)
        .lt("sent_at", todayEnd)
        .then((r) => ({ data: r.count || 0, error: r.error })),

      supabase
        .from("estimates")
        .select("id, price, sent_at")
        .or("sent_at.is.null,sent_at.gte." + new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .then((r) => ({
          data: {
            count: r.data?.length || 0,
            value: r.data?.reduce((sum, e) => sum + (Number(e.price) || 0), 0) || 0,
          },
          error: r.error,
        })),

      // Follow-ups due
      supabase
        .from("estimate_followups")
        .select("id, due_date, estimate_id, lead_id")
        .eq("sent", false)
        .lte("due_date", todayEnd.toISOString().split("T")[0])
        .order("due_date", { ascending: true })
        .limit(10)
        .then((r) => ({ data: r.data || [], error: r.error })),

      // Last activity per lead (simplified - get recent estimates)
      supabase
        .from("estimates")
        .select("lead_id, sent_at")
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(10)
        .then((r) => ({ data: r.data || [], error: r.error })),

      // Job Pipeline
      supabase
        .from("jobs")
        .select("id, contract_value")
        .eq("stage", "scheduled")
        .then((r) => ({
          data: {
            count: r.data?.length || 0,
            value: r.data?.reduce((sum, j) => sum + (Number(j.contract_value) || 0), 0) || 0,
          },
          error: r.error,
        })),

      supabase
        .from("jobs")
        .select("id, contract_value")
        .in("stage", ["in_progress", "in_production"])
        .then((r) => ({
          data: {
            count: r.data?.length || 0,
            value: r.data?.reduce((sum, j) => sum + (Number(j.contract_value) || 0), 0) || 0,
          },
          error: r.error,
        })),

      supabase
        .from("jobs")
        .select("id, contract_value")
        .eq("stage", "delayed")
        .then((r) => ({
          data: {
            count: r.data?.length || 0,
            value: r.data?.reduce((sum, j) => sum + (Number(j.contract_value) || 0), 0) || 0,
          },
          error: r.error,
        })),

      supabase
        .from("jobs")
        .select("id, contract_value")
        .eq("stage", "completed")
        .gte("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .then((r) => ({
          data: {
            count: r.data?.length || 0,
            value: r.data?.reduce((sum, j) => sum + (Number(j.contract_value) || 0), 0) || 0,
          },
          error: r.error,
        })),

      // Safety Snapshot
      supabase
        .from("ppe_checks")
        .select("id, date, hard_hat, harness, boots, vest")
        .eq("workspace_id", workspaceId)
        .eq("date", today.toISOString().split("T")[0])
        .then((r) => ({
          data:
            r.data?.filter(
              (pc) =>
                !pc.hard_hat || !pc.harness || !pc.boots || !pc.vest
            ).length || 0,
          error: r.error,
        })),

      supabase
        .from("toolbox_talks")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("date", today.toISOString().split("T")[0])
        .limit(1)
        .then((r) => ({ data: (r.data?.length || 0) === 0, error: r.error })),

      supabase
        .from("incident_reports")
        .select("id, severity, status")
        .eq("workspace_id", workspaceId)
        .in("status", ["reported", "investigating"])
        .then((r) => ({
          data: {
            total: r.data?.length || 0,
            critical: r.data?.filter((i) => i.severity === "critical" || i.severity === "Critical").length || 0,
          },
          error: r.error,
        })),

      // Smart Alerts
      supabase
        .from("leads")
        .select("id, name, email, is_hot, pipeline_stage")
        .eq("workspace_id", workspaceId)
        .or("is_hot.eq.true,pipeline_stage.eq.hot")
        .then(async (r) => {
          if (r.error || !r.data) return { data: [], error: r.error };
          const hotLeadIds = r.data.map((l) => l.id);
          const { data: estimates } = await supabase
            .from("estimates")
            .select("lead_id")
            .in("lead_id", hotLeadIds);
          const leadIdsWithEstimates = new Set(estimates?.map((e) => e.lead_id) || []);
          return {
            data: r.data.filter((l) => !leadIdsWithEstimates.has(l.id)).slice(0, 5),
            error: null,
          };
        }),

      supabase
        .from("estimate_followups")
        .select("id, due_date, estimate_id, lead_id")
        .eq("sent", false)
        .lt("due_date", today.toISOString().split("T")[0])
        .order("due_date", { ascending: true })
        .limit(5)
        .then((r) => ({ data: r.data || [], error: r.error })),

      supabase
        .from("jobs")
        .select("id, lead_id, stage")
        .eq("stage", "approved")
        .is("scheduled_start_date", null)
        .limit(5)
        .then((r) => ({ data: r.data || [], error: r.error })),
    ]);

    // Aggregate results
    const dashboardData = {
      // Money Today Overview
      moneyToday: {
        projectedRevenue: projectedRevenueResult.data || 0,
        activeJobs: activeJobsResult.data || 0,
        hotLeads: hotLeadsResult.data || 0,
        followupsDueToday: followupsDueTodayResult.data || 0,
      },

      // Lead Overview
      leadOverview: {
        newLeadsToday: newLeadsTodayResult.data || 0,
        hotLeads: hotLeadsCountResult.data || 0,
        warmLeads: warmLeadsCountResult.data || 0,
        repliesToday: repliesTodayResult.data || 0,
        conversionRate: conversionRateResult.data || 0,
      },

      // Estimate Performance
      estimatePerformance: {
        estimatesSentToday: estimatesSentTodayResult.data || 0,
        pendingEstimates: pendingEstimatesResult.data?.count || 0,
        pendingEstimatesValue: pendingEstimatesResult.data?.value || 0,
        followupsDue: followupsDueResult.data || [],
        lastActivity: lastActivityResult.data || [],
      },

      // Job Pipeline
      jobPipeline: {
        scheduled: scheduledJobsResult.data || { count: 0, value: 0 },
        inProduction: inProductionJobsResult.data || { count: 0, value: 0 },
        delayed: delayedJobsResult.data || { count: 0, value: 0 },
        completed: completedJobsResult.data || { count: 0, value: 0 },
      },

      // Safety Snapshot
      safetySnapshot: {
        ppeNonCompliance: ppeNonComplianceResult.data || 0,
        missingToolboxTalkToday: toolboxTalkTodayResult.data || false,
        openIncidents: openIncidentsResult.data?.total || 0,
        criticalIncidents: openIncidentsResult.data?.critical || 0,
      },

      // Smart Alerts
      smartAlerts: {
        hotLeadsNoEstimate: hotLeadsNoEstimateResult.data || [],
        overdueFollowups: overdueFollowupsResult.data || [],
        jobsNoSchedule: jobsNoScheduleResult.data || [],
      },
    };

    return NextResponse.json(dashboardData, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Command center dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























