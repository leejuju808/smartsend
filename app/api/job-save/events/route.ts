// Block 22073 — SmartSend Roofing Job Save Engine v1
// API Route: Get Job Save Events
// GET /api/job-save/events?lead_id=xxx&status=active

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const leadId = searchParams.get("lead_id");
    const status = searchParams.get("status") || "active";

    let query = supabase
      .from("job_save_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Error fetching job save events:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events || [] });
  } catch (error: any) {
    console.error("Error in GET /api/job-save/events:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}









































