import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * POST /api/reports/generate
 * Generate reports for a specific period and type
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, report_type, period, period_start, period_end, company_id } = body;

    if (!workspace_id || !report_type || !period || !period_start || !period_end) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, report_type, period, period_start, period_end" },
        { status: 400 }
      );
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate report based on type
    switch (report_type) {
      case "sales_reps":
        await generateSalesRepReport(supabase, workspace_id, company_id, period, period_start, period_end);
        break;
      case "job_profit":
        await generateJobProfitReport(supabase, workspace_id, company_id, period_start, period_end);
        break;
      case "marketing_channels":
        await generateMarketingReport(supabase, workspace_id, company_id, period, period_start, period_end);
        break;
      case "crews":
        await generateCrewReport(supabase, workspace_id, company_id, period, period_start, period_end);
        break;
      case "cashflow":
        await generateCashflowReport(supabase, workspace_id, company_id, period_start, period_end);
        break;
      default:
        return NextResponse.json({ error: "Invalid report_type" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Report generated for ${report_type}` });
  } catch (error: any) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Failed to generate report", details: error.message },
      { status: 500 }
    );
  }
}

async function generateSalesRepReport(
  supabase: any,
  workspace_id: string,
  company_id: string | null,
  period: string,
  period_start: string,
  period_end: string
) {
  // Get all sales reps in workspace
  const { data: reps } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", 
      supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspace_id)
    );

  if (!reps || reps.length === 0) return;

  for (const rep of reps) {
    // Get leads assigned to this rep
    const { count: leadsAssigned } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("assigned_to", rep.id)
      .gte("created_at", period_start)
      .lte("created_at", period_end);

    // Get leads contacted
    const { count: leadsContacted } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("assigned_to", rep.id)
      .not("contacted_at", "is", null)
      .gte("created_at", period_start)
      .lte("created_at", period_end);

    // Get estimates sent (simplified - would need actual estimates table)
    const { count: estimatesSent } = await supabase
      .from("proposals")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspace_id)
      .eq("created_by", rep.id)
      .gte("created_at", period_start)
      .lte("created_at", period_end);

    // Get jobs sold
    const { data: jobsSold, count: jobsCount } = await supabase
      .from("jobs")
      .select("final_value", { count: "exact" })
      .eq("workspace_id", workspace_id)
      .eq("user_id", rep.id)
      .eq("status", "won")
      .gte("created_at", period_start)
      .lte("created_at", period_end);

    const revenue = jobsSold?.reduce((sum, job) => sum + (Number(job.final_value) || 0), 0) || 0;
    const avgTicket = jobsCount && jobsCount > 0 ? revenue / jobsCount : 0;
    const closeRate = estimatesSent && estimatesSent > 0 ? (jobsCount || 0) / estimatesSent * 100 : 0;
    const conversionRate = leadsAssigned && leadsAssigned > 0 ? (jobsCount || 0) / leadsAssigned * 100 : 0;

    // Upsert report
    await supabase
      .from("report_sales_reps")
      .upsert({
        workspace_id,
        roofing_company_id: company_id,
        rep_id: rep.id,
        rep_name: rep.full_name,
        period,
        period_start,
        period_end,
        leads_assigned: leadsAssigned || 0,
        leads_contacted: leadsContacted || 0,
        contact_rate: leadsAssigned && leadsAssigned > 0 ? (leadsContacted || 0) / leadsAssigned * 100 : 0,
        estimates_sent: estimatesSent || 0,
        jobs_sold: jobsCount || 0,
        revenue,
        avg_ticket: avgTicket,
        close_rate: closeRate,
        conversion_rate: conversionRate,
      }, {
        onConflict: "workspace_id,rep_id,period,period_start"
      });
  }
}

async function generateJobProfitReport(
  supabase: any,
  workspace_id: string,
  company_id: string | null,
  period_start: string,
  period_end: string
) {
  // Get jobs in period
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, final_value, estimated_value, job_type, status, created_at")
    .eq("workspace_id", workspace_id)
    .gte("created_at", period_start)
    .lte("created_at", period_end);

  if (!jobs || jobs.length === 0) return;

  for (const job of jobs) {
    // Get cost data (from job_costs or profit_analysis table)
    const { data: costs } = await supabase
      .from("job_costs")
      .select("materials_cost, labor_cost, equipment_cost, total_cost")
      .eq("job_id", job.id)
      .single();

    const revenue = Number(job.final_value) || Number(job.estimated_value) || 0;
    const materialCost = Number(costs?.materials_cost) || 0;
    const laborCost = Number(costs?.labor_cost) || 0;
    const equipmentCost = Number(costs?.equipment_cost) || 0;
    const totalCost = Number(costs?.total_cost) || materialCost + laborCost + equipmentCost;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    await supabase
      .from("report_job_profit")
      .upsert({
        workspace_id,
        roofing_company_id: company_id,
        job_id: job.id,
        job_type: job.job_type,
        revenue,
        estimated_revenue: Number(job.estimated_value) || 0,
        labor_cost: laborCost,
        material_cost: materialCost,
        equipment_cost: equipmentCost,
        total_cost: totalCost,
        profit,
        margin,
        job_status: job.status,
        created_at: job.created_at,
      }, {
        onConflict: "job_id"
      });
  }
}

async function generateMarketingReport(
  supabase: any,
  workspace_id: string,
  company_id: string | null,
  period: string,
  period_start: string,
  period_end: string
) {
  // Get leads grouped by source/channel
  const { data: leads } = await supabase
    .from("leads")
    .select("lead_source, id")
    .eq("workspace_id", workspace_id)
    .gte("created_at", period_start)
    .lte("created_at", period_end);

  if (!leads || leads.length === 0) return;

  // Group by channel
  const channelMap = new Map<string, any>();
  
  for (const lead of leads) {
    const channel = lead.lead_source || "direct";
    if (!channelMap.has(channel)) {
      channelMap.set(channel, {
        leads: 0,
        jobs: 0,
        revenue: 0,
        cost: 0,
      });
    }
    const stats = channelMap.get(channel)!;
    stats.leads++;
  }

  // Get jobs and revenue by channel
  for (const [channel, stats] of channelMap.entries()) {
    const { data: jobs } = await supabase
      .from("jobs")
      .select("final_value")
      .eq("workspace_id", workspace_id)
      .in("lead_id", 
        leads.filter(l => (l.lead_source || "direct") === channel).map(l => l.id)
      )
      .gte("created_at", period_start)
      .lte("created_at", period_end);

    stats.jobs = jobs?.length || 0;
    stats.revenue = jobs?.reduce((sum, j) => sum + (Number(j.final_value) || 0), 0) || 0;
    stats.cost = 0; // Would need marketing spend data

    const conversionRate = stats.leads > 0 ? (stats.jobs / stats.leads) * 100 : 0;
    const costPerLead = stats.leads > 0 ? stats.cost / stats.leads : 0;
    const costPerJob = stats.jobs > 0 ? stats.cost / stats.jobs : 0;
    const roi = stats.cost > 0 ? ((stats.revenue - stats.cost) / stats.cost) * 100 : 0;

    await supabase
      .from("report_marketing_channels")
      .upsert({
        workspace_id,
        roofing_company_id: company_id,
        channel,
        period,
        period_start,
        period_end,
        leads: stats.leads,
        jobs_won: stats.jobs,
        revenue: stats.revenue,
        cost: stats.cost,
        conversion_rate: conversionRate,
        cost_per_lead: costPerLead,
        cost_per_job: costPerJob,
        roi,
      }, {
        onConflict: "workspace_id,channel,period,period_start"
      });
  }
}

async function generateCrewReport(
  supabase: any,
  workspace_id: string,
  company_id: string | null,
  period: string,
  period_start: string,
  period_end: string
) {
  // Get all crews
  const { data: crews } = await supabase
    .from("crews")
    .select("id, name")
    .eq("workspace_id", workspace_id);

  if (!crews || crews.length === 0) return;

  for (const crew of crews) {
    // Get crew assignments/jobs
    const { data: assignments } = await supabase
      .from("crew_assignments")
      .select("job_id, status")
      .eq("crew_id", crew.id)
      .gte("assigned_at", period_start)
      .lte("assigned_at", period_end);

    const jobsCompleted = assignments?.filter(a => a.status === "completed").length || 0;
    const jobsScheduled = assignments?.length || 0;

    // Calculate average duration (simplified)
    const avgDurationHours = 8; // Would calculate from actual job data

    // Get issues/rework (simplified)
    const issuesReported = 0;
    const reworkCount = 0;

    await supabase
      .from("report_crews")
      .upsert({
        workspace_id,
        roofing_company_id: company_id,
        crew_id: crew.id,
        crew_name: crew.name,
        period,
        period_start,
        period_end,
        jobs_completed: jobsCompleted,
        jobs_scheduled: jobsScheduled,
        on_time_rate: jobsScheduled > 0 ? (jobsCompleted / jobsScheduled) * 100 : 0,
        avg_duration_hours: avgDurationHours,
        issues_reported: issuesReported,
        rework_count: reworkCount,
        rework_rate: jobsCompleted > 0 ? (reworkCount / jobsCompleted) * 100 : 0,
      }, {
        onConflict: "workspace_id,crew_id,period,period_start"
      });
  }
}

async function generateCashflowReport(
  supabase: any,
  workspace_id: string,
  company_id: string | null,
  period_start: string,
  period_end: string
) {
  // Get payments received (cash in)
  const { data: payments } = await supabase
    .from("payments")
    .select("amount")
    .eq("workspace_id", workspace_id)
    .eq("status", "paid")
    .gte("paid_at", period_start)
    .lte("paid_at", period_end);

  const cashIn = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

  // Get expenses (cash out) - simplified
  const cashOut = 0; // Would query expenses table

  // Get AR (outstanding invoices)
  const { data: invoices } = await supabase
    .from("invoices")
    .select("amount, due_date, paid_at")
    .eq("workspace_id", workspace_id)
    .is("paid_at", null);

  const arTotal = invoices?.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0) || 0;

  // Calculate AR aging
  const now = new Date();
  const arCurrent = invoices?.filter(inv => {
    const due = new Date(inv.due_date);
    const daysDiff = (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  }).reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0) || 0;

  await supabase
    .from("report_cashflow")
    .upsert({
      workspace_id,
      roofing_company_id: company_id,
      period_start,
      period_end,
      cash_in: cashIn,
      cash_out: cashOut,
      net_cashflow: cashIn - cashOut,
      ar_total: arTotal,
      ar_current: arCurrent,
      ar_overdue_30: arTotal - arCurrent, // Simplified
    }, {
      onConflict: "workspace_id,period_start"
    });
}

























