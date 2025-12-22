import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * AUREV HQ Unified Metrics API
 * Returns combined metrics across SmartSend, OpsGrid, and AgentCloud
 */
export async function GET(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Get all orgs
    const { data: orgs } = await supabase
      .from("orgs")
      .select("id")
      .limit(1000);

    const totalOrgs = orgs?.length || 0;

    // Get SmartSend metrics
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .limit(10000);

    const { data: emailLogs } = await supabase
      .from("email_logs")
      .select("id, sent_at, org_id")
      .gte("sent_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .limit(10000);

    const emailsSentToday = emailLogs?.length || 0;

    // Get leads generated (approximate from email_logs)
    const { data: leadsStats } = await supabase
      .from("leads")
      .select("id")
      .limit(10000);

    // Get usage tracking data
    const { data: usageData } = await supabase
      .from("aurev_usage_tracking")
      .select("actions_count, module, year, month")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(100);

    // Get revenue data
    const { data: revenueData } = await supabase
      .from("app_revenue")
      .select("mrr, arr, active_subscriptions")
      .limit(100);

    // Aggregate totals
    const totalRevenue = revenueData?.reduce((acc, rev) => ({
      mrr: (acc.mrr || 0) + Number(rev.mrr || 0),
      arr: (acc.arr || 0) + Number(rev.arr || 0),
      active_subscriptions: (acc.active_subscriptions || 0) + (rev.active_subscriptions || 0)
    }), { mrr: 0, arr: 0, active_subscriptions: 0 }) || { mrr: 0, arr: 0, active_subscriptions: 0 };

    // Get recent events
    const { data: recentEvents } = await supabase
      .from("aurev_events")
      .select("id, event_type, module, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    const recentActivity = recentEvents?.map(event => ({
      id: event.id,
      app: event.module,
      action: event.event_type,
      timestamp: event.created_at
    })) || [];

    // Calculate today's actions
    const today = new Date();
    const todayUsage = usageData?.filter(u => 
      u.year === today.getFullYear() && u.month === today.getMonth() + 1
    ) || [];
    const totalActionsToday = todayUsage.reduce((sum, u) => sum + (u.actions_count || 0), 0);

    // Build response
    const response = {
      org_id: null, // Global metrics
      total_users: 0, // Could be fetched from auth.users if needed
      total_actions_today: totalActionsToday,
      combined_revenue: {
        mrr: totalRevenue.mrr,
        arr: totalRevenue.arr,
        active_orgs: totalOrgs
      },
      apps: {
        smartsend: {
          active: true,
          emails_sent_today: emailsSentToday,
          leads_generated: leadsStats?.length || 0
        },
        opsgrid: {
          active: false, // Set to true when OpsGrid is implemented
          workflows_run: 0,
          tasks_completed: 0
        },
        agentcloud: {
          active: false, // Set to true when AgentCloud is implemented
          messages_sent: 0,
          agents_deployed: 0
        }
      },
      recent_activity: recentActivity
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    console.error("AUREV metrics error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

