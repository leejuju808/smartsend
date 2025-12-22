// Block 22960 — SmartSend Roofing KPI Dashboard v1
// Edge Function — Daily KPI Computation
// Computes all KPIs and stores them in kpi_snapshots table

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Get all workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
      return new Response(
        JSON.stringify({ error: workspacesError.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    if (!workspaces || workspaces.length === 0) {
      return new Response(
        JSON.stringify({ message: "No workspaces found", processed: 0 }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    let processed = 0;
    const errors: string[] = [];

    // Process each workspace
    for (const workspace of workspaces) {
      const workspace_id = workspace.id;

      try {
        // ============================================================
        // 1. REVENUE KPIs
        // ============================================================
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const currentYear = new Date().getFullYear().toString();

        // Jobs sold this month
        const { data: jobsSold, error: jobsSoldError } = await supabase
          .from("roofing_jobs")
          .select("id, job_value, created_at")
          .eq("workspace_id", workspace_id)
          .gte("created_at", `${currentMonth}-01`)
          .in("status", ["scheduled", "in_progress", "completed"]);

        // Jobs completed this month
        const { data: jobsCompleted, error: jobsCompletedError } = await supabase
          .from("roofing_jobs")
          .select("id")
          .eq("workspace_id", workspace_id)
          .eq("status", "completed")
          .gte("created_at", `${currentMonth}-01`);

        // Revenue collected (from payments)
        const { data: payments, error: paymentsError } = await supabase
          .from("job_payments")
          .select("amount, created_at")
          .eq("org_id", workspace_id) // Note: payments use org_id, may need mapping
          .gte("created_at", `${currentYear}-01-01`);

        // Total job value for A/R calculation
        const { data: allJobs, error: allJobsError } = await supabase
          .from("roofing_jobs")
          .select("job_value")
          .eq("workspace_id", workspace_id)
          .in("status", ["scheduled", "in_progress", "completed"]);

        const revenue_collected = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
        const total_job_value = allJobs?.reduce((sum, j) => sum + Number(j.job_value || 0), 0) || 0;
        const ar_outstanding = total_job_value - revenue_collected;
        const avg_job_size = jobsSold && jobsSold.length > 0
          ? jobsSold.reduce((sum, j) => sum + Number(j.job_value || 0), 0) / jobsSold.length
          : 0;

        // ============================================================
        // 2. MARGIN KPIs
        // ============================================================
        const { data: jobMargins, error: marginError } = await supabase
          .from("roofing_jobs")
          .select("job_value, actual_material_cost, actual_labor_cost, actual_other_cost")
          .eq("workspace_id", workspace_id)
          .in("status", ["scheduled", "in_progress", "completed"]);

        let avg_margin = 0;
        let jobs_under_30 = 0;
        let jobs_over_45 = 0;

        if (jobMargins && jobMargins.length > 0) {
          const margins: number[] = [];
          jobMargins.forEach((job) => {
            const revenue = Number(job.job_value || 0);
            const costs = Number(job.actual_material_cost || 0) +
                         Number(job.actual_labor_cost || 0) +
                         Number(job.actual_other_cost || 0);
            if (revenue > 0) {
              const margin = ((revenue - costs) / revenue) * 100;
              margins.push(margin);
              if (margin < 30) jobs_under_30++;
              if (margin > 45) jobs_over_45++;
            }
          });
          avg_margin = margins.length > 0
            ? margins.reduce((sum, m) => sum + m, 0) / margins.length
            : 0;
        }

        // ============================================================
        // 3. CREW EFFICIENCY KPIs
        // ============================================================
        const { data: crewSessions, error: crewError } = await supabase
          .from("job_field_sessions")
          .select("crew_id, check_in_at, check_out_at, progress_percent, job_id")
          .eq("workspace_id", workspace_id)
          .not("check_out_at", "is", null);

        let avg_hours_per_job = 0;
        let avg_jobs_per_week = 0;
        let total_crew_sessions = 0;

        if (crewSessions && crewSessions.length > 0) {
          const hours: number[] = [];
          const uniqueJobs = new Set<string>();
          const weeks = new Set<string>();

          crewSessions.forEach((session) => {
            if (session.check_in_at && session.check_out_at) {
              const hoursDiff = (new Date(session.check_out_at).getTime() -
                                new Date(session.check_in_at).getTime()) / (1000 * 60 * 60);
              hours.push(hoursDiff);
              if (session.job_id) uniqueJobs.add(session.job_id);
              
              const weekKey = new Date(session.check_in_at).toISOString().slice(0, 10);
              weeks.add(weekKey);
            }
          });

          avg_hours_per_job = hours.length > 0
            ? hours.reduce((sum, h) => sum + h, 0) / hours.length
            : 0;
          avg_jobs_per_week = weeks.size > 0
            ? uniqueJobs.size / weeks.size
            : 0;
          total_crew_sessions = crewSessions.length;
        }

        // ============================================================
        // 4. SALES METRICS KPIs
        // ============================================================
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("id, created_at")
          .eq("workspace_id", workspace_id)
          .gte("created_at", `${currentMonth}-01`);

        const { data: proposals, error: proposalsError } = await supabase
          .from("proposals")
          .select("id, lead_id, status")
          .eq("workspace_id", workspace_id)
          .gte("created_at", `${currentMonth}-01`);

        const { data: wonJobs, error: wonJobsError } = await supabase
          .from("roofing_jobs")
          .select("id, job_value, lead_id")
          .eq("workspace_id", workspace_id)
          .in("status", ["scheduled", "in_progress", "completed"])
          .gte("created_at", `${currentMonth}-01`);

        const leads_generated = leads?.length || 0;
        const estimates_sent = proposals?.length || 0;
        const jobs_won = wonJobs?.length || 0;
        const close_rate = estimates_sent > 0 ? (jobs_won / estimates_sent) * 100 : 0;
        const total_won_revenue = wonJobs?.reduce((sum, j) => sum + Number(j.job_value || 0), 0) || 0;
        const revenue_per_lead = leads_generated > 0 ? total_won_revenue / leads_generated : 0;
        const revenue_per_estimate = estimates_sent > 0 ? total_won_revenue / estimates_sent : 0;

        // ============================================================
        // 5. SUPPLIER METRICS KPIs
        // ============================================================
        const { data: suppliers, error: suppliersError } = await supabase
          .from("suppliers")
          .select("id, name, on_time_rate, avg_delay_days")
          .eq("workspace_id", workspace_id)
          .eq("is_active", true);

        let avg_on_time_rate = 0;
        let avg_delay_days = 0;
        let total_suppliers = 0;

        if (suppliers && suppliers.length > 0) {
          const onTimeRates = suppliers
            .map(s => Number(s.on_time_rate || 0))
            .filter(r => r > 0);
          const delayDays = suppliers
            .map(s => Number(s.avg_delay_days || 0))
            .filter(d => d > 0);

          avg_on_time_rate = onTimeRates.length > 0
            ? onTimeRates.reduce((sum, r) => sum + r, 0) / onTimeRates.length
            : 0;
          avg_delay_days = delayDays.length > 0
            ? delayDays.reduce((sum, d) => sum + d, 0) / delayDays.length
            : 0;
          total_suppliers = suppliers.length;
        }

        // ============================================================
        // 6. STORE SNAPSHOT
        // ============================================================
        const metrics = {
          // Revenue
          jobs_sold_this_month: jobsSold?.length || 0,
          jobs_completed_this_month: jobsCompleted?.length || 0,
          revenue_collected,
          ar_outstanding,
          avg_job_size,
          ytd_revenue: revenue_collected, // YTD is same as current year revenue_collected

          // Margin
          avg_margin,
          jobs_under_30_margin: jobs_under_30,
          jobs_over_45_margin: jobs_over_45,

          // Crew
          avg_hours_per_job,
          avg_jobs_per_week,
          total_crew_sessions,

          // Sales
          leads_generated,
          estimates_sent,
          jobs_won,
          close_rate_pct: close_rate,
          revenue_per_lead,
          revenue_per_estimate,

          // Supplier
          avg_on_time_rate,
          avg_delay_days,
          total_suppliers,
        };

        // Upsert snapshot (replace if exists for today)
        const { error: snapshotError } = await supabase
          .from("kpi_snapshots")
          .upsert({
            workspace_id,
            snapshot_date: today,
            metrics,
          }, {
            onConflict: "workspace_id,snapshot_date",
          });

        if (snapshotError) {
          console.error(`Error storing snapshot for workspace ${workspace_id}:`, snapshotError);
          errors.push(`Workspace ${workspace_id}: ${snapshotError.message}`);
        } else {
          processed++;
        }
      } catch (workspaceError: any) {
        console.error(`Error processing workspace ${workspace_id}:`, workspaceError);
        errors.push(`Workspace ${workspace_id}: ${workspaceError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        total_workspaces: workspaces.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    console.error("Error in kpi-compute:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});







































