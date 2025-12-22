// Block 85000 — SmartSend Roofing "Owner KPI Dashboard + Business Health Score Engine" v1
// API Endpoint: /api/kpi/dashboard
// Returns all KPI data for the CEO dashboard

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get("company_id");
    const workspaceId = searchParams.get("workspace_id");
    const orgId = searchParams.get("org_id");
    const days = parseInt(searchParams.get("days") || "30");

    // Get latest snapshot
    let query = supabase
      .from("company_kpi_snapshots")
      .select("*")
      .order("date", { ascending: false })
      .limit(1);

    if (companyId) {
      query = query.eq("company_id", companyId);
    } else if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    } else if (orgId) {
      query = query.eq("org_id", orgId);
    }

    const { data: latestSnapshot, error: snapshotError } = await query;

    if (snapshotError) {
      throw new Error(`Error fetching snapshot: ${snapshotError.message}`);
    }

    // Get trend data (last N days)
    let trendQuery = supabase
      .from("company_kpi_snapshots")
      .select("*")
      .order("date", { ascending: true })
      .gte("date", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    if (companyId) {
      trendQuery = trendQuery.eq("company_id", companyId);
    } else if (workspaceId) {
      trendQuery = trendQuery.eq("workspace_id", workspaceId);
    } else if (orgId) {
      trendQuery = trendQuery.eq("org_id", orgId);
    }

    const { data: trendData, error: trendError } = await trendQuery;

    if (trendError) {
      throw new Error(`Error fetching trend data: ${trendError.message}`);
    }

    // Get latest business health score
    let healthQuery = supabase
      .from("business_health_scores")
      .select("*")
      .order("period_end_date", { ascending: false })
      .limit(1);

    if (companyId) {
      healthQuery = healthQuery.eq("company_id", companyId);
    } else if (workspaceId) {
      healthQuery = healthQuery.eq("workspace_id", workspaceId);
    } else if (orgId) {
      healthQuery = healthQuery.eq("org_id", orgId);
    }

    const { data: healthScore, error: healthError } = await healthQuery;

    // Get crew performance data
    let crewQuery = supabase
      .from("crew_performance_scores")
      .select("*")
      .order("period_end_date", { ascending: false })
      .limit(10);

    if (workspaceId) {
      crewQuery = crewQuery.eq("workspace_id", workspaceId);
    }

    const { data: crewPerformance, error: crewError } = await crewQuery;

    // Get ZIP code revenue data (from latest snapshot or calculate)
    const zipData = latestSnapshot?.[0]?.top_zip_codes || [];

    // Get campaign ROI data
    let campaignQuery = supabase
      .from("campaigns")
      .select(`
        id,
        name,
        created_at,
        email_events (
          event_type,
          created_at
        )
      `)
      .order("created_at", { ascending: false })
      .limit(10);

    if (workspaceId) {
      campaignQuery = campaignQuery.eq("workspace_id", workspaceId);
    }

    const { data: campaigns, error: campaignError } = await campaignQuery;

    // Calculate campaign metrics
    const campaignMetrics = campaigns?.map((campaign: any) => {
      const events = campaign.email_events || [];
      const sent = events.filter((e: any) => e.event_type === 'sent').length;
      const opened = events.filter((e: any) => e.event_type === 'open').length;
      const replied = events.filter((e: any) => e.event_type === 'reply').length;
      
      return {
        id: campaign.id,
        name: campaign.name,
        sent,
        opened,
        replied,
        open_rate: sent > 0 ? (opened / sent) * 100 : 0,
        reply_rate: sent > 0 ? (replied / sent) * 100 : 0,
      };
    }) || [];

    return NextResponse.json({
      success: true,
      data: {
        latest_snapshot: latestSnapshot?.[0] || null,
        trends: trendData || [],
        health_score: healthScore?.[0] || null,
        crew_performance: crewPerformance || [],
        zip_code_revenue: zipData,
        campaign_metrics: campaignMetrics,
      },
    });
  } catch (error) {
    console.error("Error fetching KPI dashboard data:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}



























