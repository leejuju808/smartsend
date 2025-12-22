import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const workspace_id = searchParams.get("workspace_id");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!workspace_id) {
      return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
    }

    // Verify user has access to this workspace
    const { data: membership, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (memberError || !membership) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Fetch lead source stats (using new Block 22141 schema)
    const { data: stats, error: statsError } = await supabase
      .from("lead_source_stats")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("revenue_won", { ascending: false, nullsLast: true });

    if (statsError) {
      console.error("Error fetching lead source stats:", statsError);
      return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
    }

    return NextResponse.json({ stats: stats || [] });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

