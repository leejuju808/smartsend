/**
 * GET /api/weather/events
 * Block 15900 — Get weather events for a workspace
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
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const zip = searchParams.get("zip");
    const stormType = searchParams.get("storm_type");
    const severity = searchParams.get("severity");
    const days = parseInt(searchParams.get("days") || "30");

    // Build query
    let query = supabase
      .from("weather_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("storm_started_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order("storm_started_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (zip) {
      query = query.eq("zip", zip);
    }
    if (stormType) {
      query = query.eq("storm_type", stormType);
    }
    if (severity) {
      query = query.eq("severity", severity);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching weather events:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      events: events || [],
      count: events?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/weather/events:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































