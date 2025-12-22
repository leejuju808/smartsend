// Block 22390 — SmartSend Roofing Crew Capacity Engine v1
// API Route: Get Crew Capacity Loads
// GET /api/scheduling/capacity-load?crew_id=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
// GET /api/scheduling/capacity-load?workspace_id=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD (all crews)

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

    // Parse query parameters
    const url = new URL(req.url);
    const crewId = url.searchParams.get("crew_id");
    const workspaceId = url.searchParams.get("workspace_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing from/to parameters" },
        { status: 400 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ loads: [], crews: [] });
    }

    const userWorkspaceIds = memberships.map((m) => m.workspace_id);

    // First get crews to filter by workspace
    let crewsQuery = supabase
      .from("crews")
      .select("id, name, daily_capacity, workspace_id, color")
      .in("workspace_id", userWorkspaceIds)
      .eq("is_active", true);

    if (workspaceId) {
      if (!userWorkspaceIds.includes(workspaceId)) {
        return NextResponse.json(
          { error: "Unauthorized workspace" },
          { status: 403 }
        );
      }
      crewsQuery = crewsQuery.eq("workspace_id", workspaceId);
    }

    if (crewId) {
      crewsQuery = crewsQuery.eq("id", crewId);
    }

    const { data: crews, error: crewsError } = await crewsQuery.order("name", { ascending: true });

    if (crewsError) {
      console.error("Error fetching crews:", crewsError);
      return NextResponse.json(
        { error: crewsError.message || "Failed to fetch crews" },
        { status: 500 }
      );
    }

    if (!crews || crews.length === 0) {
      return NextResponse.json({ loads: [], crews: [], weeklyLoads: {} });
    }

    const crewIds = crews.map((c) => c.id);

    // Build query for capacity loads
    let query = supabase
      .from("crew_capacity_load")
      .select("crew_id, working_day, total_load")
      .gte("working_day", from)
      .lte("working_day", to)
      .in("crew_id", crewIds);

    const { data: loads, error: loadsError } = await query.order("working_day", { ascending: true });

    if (loadsError) {
      console.error("Error fetching capacity loads:", loadsError);
      return NextResponse.json(
        { error: loadsError.message || "Failed to fetch capacity loads" },
        { status: 500 }
      );
    }

    // Enrich loads with crew data
    const enrichedLoads = (loads || []).map((load: any) => {
      const crew = crews.find((c) => c.id === load.crew_id);
      return {
        ...load,
        crew: crew || null,
      };
    });

    // Calculate weekly loads per crew
    const weeklyLoads: Record<string, { totalLoad: number; days: number; avgLoad: number; capacity: number }> = {};
    
    if (enrichedLoads) {
      enrichedLoads.forEach((load: any) => {
        const crewId = load.crew_id;
        if (!weeklyLoads[crewId]) {
          weeklyLoads[crewId] = {
            totalLoad: 0,
            days: 0,
            avgLoad: 0,
            capacity: load.crew?.daily_capacity || 1.0,
          };
        }
        weeklyLoads[crewId].totalLoad += parseFloat(load.total_load || 0);
        weeklyLoads[crewId].days += 1;
      });
    }

    // Calculate averages
    Object.keys(weeklyLoads).forEach((crewId) => {
      const load = weeklyLoads[crewId];
      load.avgLoad = load.days > 0 ? load.totalLoad / load.days : 0;
    });

    return NextResponse.json(
      {
        loads: enrichedLoads || [],
        crews: crews || [],
        weeklyLoads,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in capacity load API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

