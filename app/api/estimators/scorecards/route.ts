// Block 21746 — SmartSend Roofing Estimator Scorecard v1
// API route to fetch estimator scorecards

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user's default workspace
    const workspaceId = searchParams.get("workspace_id");
    const estimatorId = searchParams.get("estimator_id");
    const periodStart = searchParams.get("period_start");
    const periodEnd = searchParams.get("period_end");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("estimator_scorecards")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("period_end", { ascending: false });

    if (estimatorId) {
      query = query.eq("estimator_id", estimatorId);
    }

    if (periodStart) {
      query = query.gte("period_start", periodStart);
    }

    if (periodEnd) {
      query = query.lte("period_end", periodEnd);
    }

    const { data: scorecards, error } = await query;

    if (error) {
      console.error("Error fetching scorecards:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ scorecards: scorecards || [] });
  } catch (error: any) {
    console.error("Error in /api/estimators/scorecards:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









































