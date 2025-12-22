// Block 73000 — SmartSend Estimate Followups API
// GET /api/estimates/followups
// Returns pending estimate follow-ups that need to be sent

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const due = searchParams.get("due"); // "today" or "all"

    // Get leads for this workspace
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId);

    const leadIds = (leads || []).map((l) => l.id);

    if (leadIds.length === 0) {
      return NextResponse.json({ followups: [] });
    }

    // Build query
    let query = supabase
      .from("estimate_followups")
      .select(`
        id,
        estimate_id,
        lead_id,
        due_date,
        sent,
        sent_at,
        followup_sequence,
        created_at,
        estimates:estimates(
          id,
          file_url,
          price,
          sent_at
        ),
        leads:leads(
          id,
          email,
          first_name,
          last_name,
          company
        )
      `)
      .in("lead_id", leadIds)
      .eq("sent", false)
      .order("due_date", { ascending: true });

    // Filter by due date if requested
    if (due === "today") {
      const today = new Date().toISOString().split("T")[0];
      query = query.eq("due_date", today);
    }

    const { data: followups, error } = await query;

    if (error) {
      console.error("[Estimate Followups] Error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch followups" },
        { status: 500 }
      );
    }

    return NextResponse.json({ followups: followups || [] });
  } catch (error: any) {
    console.error("[Estimate Followups] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/estimates/followups - Mark followup as sent
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { followup_id } = body;

    if (!followup_id) {
      return NextResponse.json(
        { error: "followup_id is required" },
        { status: 400 }
      );
    }

    // Verify followup belongs to workspace
    const { data: followup } = await supabase
      .from("estimate_followups")
      .select(`
        id,
        lead_id,
        leads:leads!inner(workspace_id)
      `)
      .eq("id", followup_id)
      .single();

    if (!followup) {
      return NextResponse.json(
        { error: "Followup not found" },
        { status: 404 }
      );
    }

    const lead = Array.isArray(followup.leads) ? followup.leads[0] : followup.leads;
    if (lead?.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Mark as sent
    const { data: updated, error: updateError } = await supabase
      .from("estimate_followups")
      .update({
        sent: true,
        sent_at: new Date().toISOString(),
      })
      .eq("id", followup_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || "Failed to update followup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, followup: updated });
  } catch (error: any) {
    console.error("[Estimate Followups POST] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























