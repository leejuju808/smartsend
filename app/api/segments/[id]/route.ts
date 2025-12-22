// Block 11000 — Segments API
// GET /api/segments/[id] - Get segment details
// PATCH /api/segments/[id] - Update segment
// DELETE /api/segments/[id] - Delete segment

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

// GET /api/segments/[id] - Get segment details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { data: segment, error } = await supabase
      .from("segments")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !segment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ segment });
  } catch (error: any) {
    console.error("Error in GET /api/segments/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/segments/[id] - Update segment
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();

    // Verify segment exists and belongs to workspace
    const { data: existing } = await supabase
      .from("segments")
      .select("id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.filters !== undefined) updates.filters = body.filters;
    if (body.auto_update !== undefined) updates.auto_update = body.auto_update;
    if (body.status !== undefined) updates.status = body.status;

    // Check name uniqueness if name is being updated
    if (updates.name && updates.name !== existing.name) {
      const { data: nameConflict } = await supabase
        .from("segments")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", updates.name)
        .neq("id", id)
        .single();

      if (nameConflict) {
        return NextResponse.json(
          { error: "Segment with this name already exists" },
          { status: 409 }
        );
      }
    }

    const { data: segment, error } = await supabase
      .from("segments")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating segment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ segment });
  } catch (error: any) {
    console.error("Error in PATCH /api/segments/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/segments/[id] - Delete segment
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Verify segment exists and belongs to workspace
    const { data: existing } = await supabase
      .from("segments")
      .select("id, system_segment")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // Prevent deletion of system segments
    if (existing.system_segment) {
      return NextResponse.json(
        { error: "Cannot delete system segment" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("segments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting segment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/segments/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
