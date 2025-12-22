import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * AUREV OS Unified Metrics API
 * 
 * Returns aggregated metrics across all AUREV modules (SmartSend, OpsGrid, AgentCloud)
 * for the unified HQ dashboard.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: () => cookieStore }
    );

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization(s)
    const { data: orgMembers } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1);

    const orgId = orgMembers?.[0]?.org_id;
    if (!orgId) {
      // Return empty metrics if no org
      return NextResponse.json({
        campaigns: 0,
        workflows: 0,
        agents: 0,
        total_events: 0,
      });
    }

    // Fetch metrics from all apps in parallel
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const syncKey = process.env.AUREV_SYNC_KEY || "dev-key";

    const [smartsendRes, opsgridRes, agentcloudRes] = await Promise.all([
      fetch(`${baseUrl}/api/sync/smartsend`, {
        headers: { "x-aurev-sync-key": syncKey },
      }).catch(() => null),
      process.env.OPSGRID_URL
        ? fetch(`${process.env.OPSGRID_URL}/api/aurev-sync`, {
            headers: { "x-aurev-sync-key": syncKey },
          }).catch(() => null)
        : null,
      process.env.AGENTCLOUD_URL
        ? fetch(`${process.env.AGENTCLOUD_URL}/api/aurev-sync`, {
            headers: { "x-aurev-sync-key": syncKey },
          }).catch(() => null)
        : null,
    ]);

    // Parse responses
    const smartsendData = smartsendRes?.ok ? await smartsendRes.json() : { active_campaigns: 0 };
    const opsgridData = opsgridRes?.ok ? await opsgridRes.json() : { active_workflows: 0, open_tasks: 0 };
    const agentcloudData = agentcloudRes?.ok ? await agentcloudRes.json() : { active_agents: 0, live_deployments: 0 };

    // Get unified analytics events count
    const { count: totalEvents } = await supabase
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    // Get enterprise metrics
    const { data: enterpriseMetrics } = await supabase
      .from("enterprise_metrics")
      .select("*")
      .single();

    // Return aggregated metrics
    return NextResponse.json({
      campaigns: smartsendData.active_campaigns || 0,
      workflows: opsgridData.active_workflows || 0,
      agents: agentcloudData.active_agents || 0,
      total_events: totalEvents || 0,
      enterprise: enterpriseMetrics || {
        active_orgs: 0,
        total_seats: 0,
        avg_org_value: 0,
      },
    });
  } catch (error: any) {
    console.error("OS metrics API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

