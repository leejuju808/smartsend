// Block 35333 — Get Lead Revival Status
// Returns revival information for a specific lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const leadId = searchParams.get("lead_id");
    const workspaceId = searchParams.get("workspace_id");

    if (!leadId || !workspaceId) {
      return NextResponse.json(
        { error: "lead_id and workspace_id are required" },
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

    // Get lead with revival info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    if (lead.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Lead does not belong to workspace" },
        { status: 403 }
      );
    }

    // Get status history
    const { data: statusHistory } = await supabase
      .from("lead_status_history")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get revival events
    const { data: revivalEvents } = await supabase
      .from("revival_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get revival sequences
    const { data: revivalSequences } = await supabase
      .from("revival_sequences")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      lead,
      statusHistory: statusHistory || [],
      revivalEvents: revivalEvents || [],
      revivalSequences: revivalSequences || [],
    });
  } catch (error: any) {
    console.error("Error fetching lead revival status:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
































