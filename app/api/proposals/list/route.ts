// Block 57000 — API Route: GET /api/proposals/list
// Lists proposals with filters

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    const { data: workspaces } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    const workspaceIds = workspaces?.map((w) => w.workspace_id) || [];

    if (workspaceIds.length === 0) {
      return NextResponse.json({ proposals: [] });
    }

    // Get proposals
    const { data: proposals, error: proposalsError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*)
      `)
      .in("workspace_id", workspaceIds)
      .order("created_at", { ascending: false });

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
      return NextResponse.json(
        { error: "Failed to fetch proposals", details: proposalsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ proposals: proposals || [] });
  } catch (error) {
    console.error("Error in /api/proposals/list:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































