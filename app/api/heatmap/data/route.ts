// Block 24580 — SmartSend Roofing Neighborhood Heatmap v1
// API Route: Get Heatmap Data
// GET /api/heatmap/data?workspace_id=xxx&layer=engagement|pipeline|storm

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
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const layer = searchParams.get("layer") || "engagement"; // engagement, pipeline, storm

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Recalculate heatmap data (or use cached)
    await supabase.rpc("calculate_neighborhood_heatmap", {
      p_workspace_id: workspace_id,
      p_zip: null,
      p_neighborhood_name: null,
    });

    // Fetch heatmap data based on layer
    let query = supabase
      .from("neighborhood_heatmap_data")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("opportunity_score", { ascending: false });

    const { data: heatmapData, error: heatmapError } = await query;

    if (heatmapError) {
      console.error("Heatmap data error:", heatmapError);
      return NextResponse.json(
        { error: "Failed to fetch heatmap data" },
        { status: 500 }
      );
    }

    // Format data based on layer
    const formattedData = (heatmapData || []).map((item) => {
      if (layer === "engagement") {
        return {
          zip: item.zip,
          neighborhood_name: item.neighborhood_name,
          city: item.city,
          state: item.state,
          center_lat: item.center_lat,
          center_lon: item.center_lon,
          total_sent: item.total_sent,
          total_opens: item.total_opens,
          total_clicks: item.total_clicks,
          total_replies: item.total_replies,
          total_bookings: item.total_bookings,
          open_rate_pct: item.open_rate_pct,
          reply_rate_pct: item.reply_rate_pct,
          booking_rate_pct: item.booking_rate_pct,
          engagement_heat_score: item.engagement_heat_score,
          engagement_heat_color: item.engagement_heat_color,
        };
      } else if (layer === "pipeline") {
        return {
          zip: item.zip,
          neighborhood_name: item.neighborhood_name,
          city: item.city,
          state: item.state,
          center_lat: item.center_lat,
          center_lon: item.center_lon,
          leads_in_lead_in: item.leads_in_lead_in,
          leads_in_inspection_set: item.leads_in_inspection_set,
          leads_in_quote_sent: item.leads_in_quote_sent,
          leads_in_approved: item.leads_in_approved,
          leads_in_scheduled: item.leads_in_scheduled,
          leads_in_installed: item.leads_in_installed,
          total_active_jobs: item.total_active_jobs,
          total_revenue: item.total_revenue,
          avg_job_value: item.avg_job_value,
          pipeline_heat_score: item.pipeline_heat_score,
        };
      } else {
        // storm layer
        return {
          zip: item.zip,
          neighborhood_name: item.neighborhood_name,
          city: item.city,
          state: item.state,
          center_lat: item.center_lat,
          center_lon: item.center_lon,
          storm_severity_score: item.storm_severity_score,
          last_storm_date: item.last_storm_date,
          storm_risk_level: item.storm_risk_level,
          affected_homes_estimate: item.affected_homes_estimate,
        };
      }
    });

    return NextResponse.json({
      layer,
      data: formattedData,
      count: formattedData.length,
    });
  } catch (err: any) {
    console.error("Heatmap data error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch heatmap data",
        details: err.message,
      },
      { status: 500 }
    );
  }
}






































