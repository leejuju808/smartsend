// Block 224000 — SmartSend Roofing Crews API
// GET /api/crews?active=true
// Returns list of crews

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

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ crews: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Parse query parameters
    const url = new URL(req.url);
    const active = url.searchParams.get("active");

    // Build query
    let query = supabase
      .from("crews")
      .select("*")
      .in("workspace_id", workspaceIds)
      .order("name", { ascending: true });

    if (active === "true") {
      query = query.eq("active", true);
    }

    const { data: crews, error } = await query;

    if (error) {
      console.error("Error fetching crews:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch crews" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      crews: crews || [],
      count: crews?.length || 0,
    });
  } catch (error: any) {
    console.error("Crews API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
