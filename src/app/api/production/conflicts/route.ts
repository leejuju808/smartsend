// Block 38390 — SmartSend Roofing Production Calendar Conflicts API
// GET /api/production/conflicts?workspace_id=uuid&resolved=false
// POST /api/production/conflicts/:id/resolve - Resolve a conflict

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET conflicts
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
      return NextResponse.json({ conflicts: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Parse query parameters
    const url = new URL(req.url);
    const workspace_id = url.searchParams.get("workspace_id");
    const resolved = url.searchParams.get("resolved");

    // Build query
    let query = supabase
      .from("schedule_conflicts")
      .select(`
        id,
        job_id,
        crew_id,
        conflict_type,
        severity,
        details,
        resolved,
        resolved_at,
        resolution_notes,
        detected_at,
        created_at,
        job:roofing_jobs(
          id,
          title,
          homeowner_name
        ),
        crew:crews(
          id,
          name
        )
      `)
      .in("workspace_id", workspaceIds)
      .order("detected_at", { ascending: false });

    // Apply filters
    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }
    if (resolved !== null) {
      query = query.eq("resolved", resolved === "true");
    } else {
      // Default to unresolved conflicts
      query = query.eq("resolved", false);
    }

    const { data: conflicts, error } = await query;

    if (error) {
      console.error("Error fetching conflicts:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch conflicts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      conflicts: conflicts || [],
      count: conflicts?.length || 0,
    });
  } catch (error: any) {
    console.error("Conflicts API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

// POST resolve conflict
export async function POST(req: NextRequest) {
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

    const { conflict_id, resolution_notes } = await req.json();

    if (!conflict_id) {
      return NextResponse.json(
        { error: "conflict_id is required" },
        { status: 400 }
      );
    }

    // Update conflict
    const { data: conflict, error } = await supabase
      .from("schedule_conflicts")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolution_notes || null,
      })
      .eq("id", conflict_id)
      .select()
      .single();

    if (error) {
      console.error("Error resolving conflict:", error);
      return NextResponse.json(
        { error: error.message || "Failed to resolve conflict" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      conflict,
    });
  } catch (error: any) {
    console.error("Resolve conflict API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
































