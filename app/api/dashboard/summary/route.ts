// app/api/dashboard/summary/route.ts
// Block 8990 — Simple Revenue & Reply Dashboard v1
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const accountId = user.id; // account_id for lead_auto_follow_up_stats
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThisMonth = new Date(now);
  startOfThisMonth.setDate(1);
  startOfThisMonth.setHours(0, 0, 0, 0);
  const startOfLastMonth = new Date(startOfThisMonth);
  startOfLastMonth.setMonth(startOfThisMonth.getMonth() - 1);

  // Parse range parameter: 7d, 30d, or all
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "7d";
  
  let from: Date;
  let to: Date = now;
  
  if (range === "7d") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    // all time - use account.created_at
    const { data: accountData } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", accountId)
      .single();
    from = accountData?.created_at ? new Date(accountData.created_at) : new Date(0);
  }

  try {
    // ---------------------------------------------------------------------
    // Monopoly Sprint: baseline "always-on" + seasonal immunity primitives
    // ---------------------------------------------------------------------

    // Jobs created this month vs last month (using lead creation as "job start")
    const [{ count: jobsCreatedThisMonth }, { count: jobsCreatedLastMonth }] =
      await Promise.all([
        supabase
          .from("leads")
          .select("id", { head: true, count: "exact" })
          .eq("workspace_id", membership.workspace_id)
          .gte("created_at", startOfThisMonth.toISOString())
          .lte("created_at", now.toISOString()),
        supabase
          .from("leads")
          .select("id", { head: true, count: "exact" })
          .eq("workspace_id", membership.workspace_id)
          .gte("created_at", startOfLastMonth.toISOString())
          .lt("created_at", startOfThisMonth.toISOString()),
      ]);

    // Conversations started (last 7d) = new leads created last 7d
    const startOf7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { count: conversationsStarted7d } = await supabase
      .from("leads")
      .select("id", { head: true, count: "exact" })
      .eq("workspace_id", membership.workspace_id)
      .gte("created_at", startOf7d.toISOString())
      .lte("created_at", now.toISOString());

    // Emails + replies today (always-on proof)
    const { data: emailsSentTodayData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not("last_outbound_at", "is", null)
      .gte("last_outbound_at", startOfToday.toISOString())
      .lte("last_outbound_at", now.toISOString());
    const emailsSentToday = new Set(
      emailsSentTodayData?.map((s) => s.contact_id).filter(Boolean) || []
    ).size;

    const { data: repliesTodayData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not("last_inbound_at", "is", null)
      .gte("last_inbound_at", startOfToday.toISOString())
      .lte("last_inbound_at", now.toISOString());
    const repliesToday = new Set(
      repliesTodayData?.map((s) => s.contact_id).filter(Boolean) || []
    ).size;

    // Jobs won (last 30d) + revenue closed (last 30d)
    const startOf30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const { data: wonLeads30d } = await supabase
      .from("leads")
      .select("actual_value")
      .eq("workspace_id", membership.workspace_id)
      .eq("pipeline_stage", "won")
      .gte("closed_at", startOf30d.toISOString())
      .lte("closed_at", now.toISOString());
    const jobsWon30d = wonLeads30d?.length ?? 0;
    const revenueClosed30d =
      wonLeads30d?.reduce((sum, row: any) => sum + Number(row.actual_value ?? 0), 0) ??
      0;

    // Pipeline open value (simple sum of estimated_job_value for open pipeline stages)
    const { data: openLeads } = await supabase
      .from("leads")
      .select("estimated_job_value")
      .eq("workspace_id", membership.workspace_id)
      .neq("pipeline_stage", "won")
      .neq("pipeline_stage", "lost")
      .not("estimated_job_value", "is", null);
    const pipelineOpenValue =
      openLeads?.reduce(
        (sum: number, row: any) => sum + Number(row.estimated_job_value ?? 0),
        0
      ) ?? 0;

    // Leads created (this month)
    const leadsCreatedThisMonth = jobsCreatedThisMonth ?? 0;

    // Emails + replies this month (distinct contacts)
    const { data: emailsSentThisMonthData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not("last_outbound_at", "is", null)
      .gte("last_outbound_at", startOfThisMonth.toISOString())
      .lte("last_outbound_at", now.toISOString());
    const emailsSentThisMonth = new Set(
      emailsSentThisMonthData?.map((s) => s.contact_id).filter(Boolean) || []
    ).size;

    const { data: repliesThisMonthData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not("last_inbound_at", "is", null)
      .gte("last_inbound_at", startOfThisMonth.toISOString())
      .lte("last_inbound_at", now.toISOString());
    const repliesReceivedThisMonth = new Set(
      repliesThisMonthData?.map((s) => s.contact_id).filter(Boolean) || []
    ).size;

    const { count: hotLeadsThisMonth } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("lead_status", "hot")
      .gte("last_inbound_at", startOfThisMonth.toISOString())
      .lte("last_inbound_at", now.toISOString());

    // 1. Emails Sent - Count distinct contacts with last_outbound_at in range
    const { data: emailsSentData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not("last_outbound_at", "is", null)
      .gte("last_outbound_at", from.toISOString())
      .lte("last_outbound_at", to.toISOString());
    
    const emailsSent = new Set(emailsSentData?.map(s => s.contact_id).filter(Boolean) || []).size;

    // 2. Unique Contacts Touched - Distinct contact_id with at least one outbound in range
    const contactsTouched = emailsSent;

    // 3. Replies Received - Count distinct contacts with last_inbound_at in range
    const { data: repliesReceivedData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("contact_id")
      .eq("account_id", accountId)
      .not("last_inbound_at", "is", null)
      .gte("last_inbound_at", from.toISOString())
      .lte("last_inbound_at", to.toISOString());
    
    const repliesReceived = new Set(repliesReceivedData?.map(s => s.contact_id).filter(Boolean) || []).size;

    // 4. Positive Replies (Hot + Warm) - Count where latest intent in range is hot or warm
    const { count: positiveReplies } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .in("lead_status", ["hot", "warm"])
      .gte("last_inbound_at", from.toISOString())
      .lte("last_inbound_at", to.toISOString());

    // 5. Hot Leads - Count of leads with lead_status = 'hot'
    const { count: hotLeads } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("lead_status", "hot")
      .gte("last_inbound_at", from.toISOString())
      .lte("last_inbound_at", to.toISOString());

    // 6. Jobs Won - Count of leads where pipeline_stage = 'won'
    const { count: jobsWon } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .eq("pipeline_stage", "won")
      .gte("updated_at", from.toISOString())
      .lte("updated_at", to.toISOString());

    // 7. Estimated Revenue (Jobs Won) - Sum of closed_job_value if not null, else potential_job_value
    // Only for leads where pipeline_stage = 'won'
    const { data: wonRevenueData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("closed_job_value, potential_job_value")
      .eq("account_id", accountId)
      .eq("pipeline_stage", "won")
      .gte("updated_at", from.toISOString())
      .lte("updated_at", to.toISOString());

    const estimatedRevenueWon = wonRevenueData?.reduce((sum, row) => {
      const value = row.closed_job_value ?? row.potential_job_value ?? 0;
      return sum + Number(value);
    }, 0) ?? 0;

    // 8. Estimates Outstanding - Count of leads where pipeline_stage = 'estimate_sent' or 'follow_up'
    // Optional: sum of potential_job_value for these
    const { data: estimatesData } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("potential_job_value")
      .eq("account_id", accountId)
      .in("pipeline_stage", ["estimate_sent", "follow_up"])
      .gte("updated_at", from.toISOString())
      .lte("updated_at", to.toISOString());

    const estimatesOutstanding = {
      count: estimatesData?.length ?? 0,
      est_value: estimatesData?.reduce((sum, row) => sum + Number(row.potential_job_value ?? 0), 0) ?? 0,
    };

    // Block 11500: Get Estimated Job Value from dashboard_metrics
    const { data: dashboardMetrics } = await supabase
      .from("dashboard_metrics")
      .select("total_estimated_value, est_job_value, hot_value, warm_value, follow_up_value, new_value, hot_leads, warm_leads, follow_up_leads, new_leads")
      .eq("workspace_id", membership.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Use total_estimated_value if available, fallback to est_job_value
    const estimatedJobValue = dashboardMetrics?.total_estimated_value ?? dashboardMetrics?.est_job_value ?? 0;

    // Hot replies today (approx) = hot + warm in lead_auto_follow_up_stats with inbound today
    const { count: hotRepliesToday } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("id", { head: true, count: "exact" })
      .eq("account_id", accountId)
      .in("lead_status", ["hot", "warm"])
      .gte("last_inbound_at", startOfToday.toISOString())
      .lte("last_inbound_at", now.toISOString());

    // Jobs won this month + revenue this month (for seasonal parity)
    const { data: wonLeadsThisMonth } = await supabase
      .from("leads")
      .select("actual_value")
      .eq("workspace_id", membership.workspace_id)
      .eq("pipeline_stage", "won")
      .gte("closed_at", startOfThisMonth.toISOString())
      .lte("closed_at", now.toISOString());
    const jobsWonThisMonth = wonLeadsThisMonth?.length ?? 0;
    const revenueWonThisMonth =
      wonLeadsThisMonth?.reduce(
        (sum, row: any) => sum + Number(row.actual_value ?? 0),
        0
      ) ?? 0;

    return NextResponse.json(
      {
        ok: true,
        range,
        emails_sent: emailsSent ?? 0,
        contacts_touched: contactsTouched,
        replies_received: repliesReceived ?? 0,
        positive_replies: positiveReplies ?? 0,
        hot_leads: hotLeads ?? 0,
        jobs_won: jobsWon ?? 0,
        estimated_revenue_won: estimatedRevenueWon,
        estimates_outstanding: estimatesOutstanding,
        // Block 11500: Revenue Estimator fields
        estimated_job_value: Number(estimatedJobValue),
        total_estimated_value: Number(estimatedJobValue),
        hot_value: Number(dashboardMetrics?.hot_value ?? 0),
        warm_value: Number(dashboardMetrics?.warm_value ?? 0),
        follow_up_value: Number(dashboardMetrics?.follow_up_value ?? 0),
        new_value: Number(dashboardMetrics?.new_value ?? 0),
        follow_up_leads: dashboardMetrics?.follow_up_leads ?? 0,
        new_leads: dashboardMetrics?.new_leads ?? 0,

        // -----------------------------------------------------------------
        // Dashboard home (app/(dashboard)/page.tsx) fields
        // -----------------------------------------------------------------
        leads_created: leadsCreatedThisMonth,
        emails_sent_this_month: emailsSentThisMonth,
        replies_received_this_month: repliesReceivedThisMonth,
        hot_leads_this_month: hotLeadsThisMonth ?? 0,
        jobs_won_last_30_days: jobsWon30d,
        revenue_closed: revenueClosed30d,
        pipeline_open_value: pipelineOpenValue,

        // Seasonal immunity
        jobs_created_this_month: jobsCreatedThisMonth ?? 0,
        jobs_created_last_month: jobsCreatedLastMonth ?? 0,

        // Always-on proof
        emails_sent_today: emailsSentToday,
        replies_today: repliesToday,
        hot_replies_today: hotRepliesToday ?? 0,
        conversations_started_7d: conversationsStarted7d ?? 0,

        // Additional legacy consumers
        hot_leads_count: hotLeads ?? 0,
        follow_up_count: dashboardMetrics?.follow_up_leads ?? 0,
        pipeline_value: Number(estimatedJobValue),
        jobs_won_this_month: jobsWonThisMonth,
        revenue_won_this_month: revenueWonThisMonth,

        // RevenueActivityCards compatibility (expects { ok, summary })
        summary: {
          account_id: accountId,
          total_replies: repliesReceived ?? 0,
          contacts_replied: repliesReceived ?? 0,
          hot_leads: hotLeads ?? 0,
          warm_leads: dashboardMetrics?.warm_leads ?? 0,
          follow_up_leads: dashboardMetrics?.follow_up_leads ?? 0,
          not_interested_leads: 0,
          open_pipeline_value: Number(estimatedJobValue),
          won_revenue_value: revenueClosed30d,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error building dashboard summary:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard summary" },
      { status: 500 }
    );
  }
}
