/**
 * GET /api/weather/stats
 * Block 15900 — Get weather statistics for dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30");

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get weather events count
    const { data: events, error: eventsError } = await supabase
      .from("weather_events")
      .select("id, storm_type, severity, storm_intensity_score")
      .eq("workspace_id", workspaceId)
      .gte("storm_started_at", cutoffDate);

    if (eventsError) {
      console.error("Error fetching weather events:", eventsError);
    }

    // Get affected contacts count
    const { data: impacts, error: impactsError } = await supabase
      .from("contact_storm_impacts")
      .select("id, storm_risk_level, storm_risk_score")
      .eq("workspace_id", workspaceId)
      .gte("detected_at", cutoffDate);

    if (impactsError) {
      console.error("Error fetching storm impacts:", impactsError);
    }

    // Get campaign triggers count
    const { data: triggers, error: triggersError } = await supabase
      .from("storm_campaign_triggers")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .gte("suggested_at", cutoffDate);

    if (triggersError) {
      console.error("Error fetching storm triggers:", triggersError);
    }

    // Calculate statistics
    const totalEvents = events?.length || 0;
    const highSeverityEvents = events?.filter((e) => e.severity === "high" || e.severity === "severe" || e.severity === "extreme").length || 0;
    const averageIntensity = events && events.length > 0
      ? events.reduce((sum, e) => sum + (e.storm_intensity_score || 0), 0) / events.length
      : 0;

    const totalAffectedContacts = impacts?.length || 0;
    const highRiskContacts = impacts?.filter((i) => i.storm_risk_level === "high").length || 0;
    const mediumRiskContacts = impacts?.filter((i) => i.storm_risk_level === "medium").length || 0;

    const suggestedTriggers = triggers?.filter((t) => t.status === "suggested").length || 0;
    const startedTriggers = triggers?.filter((t) => t.status === "started").length || 0;

    // Storm type breakdown
    const stormTypeBreakdown: Record<string, number> = {};
    events?.forEach((event) => {
      stormTypeBreakdown[event.storm_type] = (stormTypeBreakdown[event.storm_type] || 0) + 1;
    });

    return NextResponse.json({
      stats: {
        totalEvents,
        highSeverityEvents,
        averageIntensity: Math.round(averageIntensity),
        totalAffectedContacts,
        highRiskContacts,
        mediumRiskContacts,
        suggestedTriggers,
        startedTriggers,
        stormTypeBreakdown,
      },
      period: {
        days,
        startDate: cutoffDate,
        endDate: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/weather/stats:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































