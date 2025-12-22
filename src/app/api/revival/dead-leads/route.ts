// Block 35333 — Get Dead Leads
// Returns filtered list of dead leads for management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id");
    const filter = searchParams.get("filter") || "all"; // all, proposal_not_signed, appointment_not_booked, storm_trigger, financing_reopen, high_potential
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build query based on filter
    let query = supabase
      .from("dead_leads_view")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("revival_score", { ascending: false, nullsLast: true })
      .order("days_inactive", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filter === "proposal_not_signed") {
      query = query.not("proposal_sent_at", "is", null).is("proposal_viewed_at", null);
    } else if (filter === "appointment_not_booked") {
      query = query.is("appointment_booked_at", null);
    } else if (filter === "storm_trigger") {
      // This would need integration with storm detection - for now just return high potential
      query = query.gte("revival_score", 50);
    } else if (filter === "financing_reopen") {
      // Would need to check for financing clicks - for now use behavior_detected events
      query = query.gte("revival_score", 40);
    } else if (filter === "high_potential") {
      query = query.gte("revival_score", 60);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error("Error fetching dead leads:", error);
      return NextResponse.json(
        { error: "Failed to fetch dead leads", details: error.message },
        { status: 500 }
      );
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("dead_leads_view")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    if (filter === "proposal_not_signed") {
      countQuery = countQuery.not("proposal_sent_at", "is", null).is("proposal_viewed_at", null);
    } else if (filter === "appointment_not_booked") {
      countQuery = countQuery.is("appointment_booked_at", null);
    } else if (filter === "high_potential") {
      countQuery = countQuery.gte("revival_score", 60);
    }

    const { count } = await countQuery;

    return NextResponse.json({
      leads: leads || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Error in dead leads endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
































