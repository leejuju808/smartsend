// Block 11000 — Segments API
// GET /api/segments - List all segments for workspace
// POST /api/segments - Create a new segment

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

// GET /api/segments - List all segments
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get("include_archived") === "true";

    let query = supabase
      .from("segments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (!includeArchived) {
      query = query.eq("status", "active");
    }

    const { data: segments, error } = await query;

    if (error) {
      console.error("Error fetching segments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ segments: segments || [] });
  } catch (error: any) {
    console.error("Error in GET /api/segments:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/segments - Create a new segment
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, filters, auto_update, system_segment } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Segment name is required" },
        { status: 400 }
      );
    }

    if (!filters || typeof filters !== "object") {
      return NextResponse.json(
        { error: "Filters object is required" },
        { status: 400 }
      );
    }

    // Check if segment name already exists
    const { data: existing } = await supabase
      .from("segments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", name.trim())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Segment with this name already exists" },
        { status: 409 }
      );
    }

    // Create segment
    const { data, error } = await supabase
      .from("segments")
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description || null,
        filters: filters,
        auto_update: auto_update !== undefined ? auto_update : true,
        system_segment: system_segment || false,
        created_by: user.id,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating segment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ segment: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/segments:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
