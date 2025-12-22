// Block 12900 — SmartSend List Builder Tools v1
// GET /api/lists/[id] - Get list details
// PUT /api/lists/[id] - Update list
// DELETE /api/lists/[id] - Delete list

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    const { data: list, error } = await supabase
      .from("contact_lists")
      .select("id, name, description, tags, visibility, created_at, updated_at")
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !list) {
      return NextResponse.json(
        { error: "List not found" },
        { status: 404 }
      );
    }

    // Get contact count
    const { count } = await supabase
      .from("contact_list_members")
      .select("*", { count: "exact", head: true })
      .eq("list_id", list.id);

    // Get insights from view
    const { data: insights } = await supabase
      .from("list_insights")
      .select("*")
      .eq("list_id", params.id)
      .single();

    return NextResponse.json({
      list: {
        ...list,
        contact_count: count || 0,
        insights: insights || null,
      },
    });
  } catch (err: any) {
    console.error("GET /api/lists/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, visibility } = body as {
      name?: string;
      description?: string;
      visibility?: "everyone" | "owner_manager";
    };

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (visibility !== undefined) updateData.visibility = visibility;

    const { data: list, error } = await supabase
      .from("contact_lists")
      .update(updateData)
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select("id, name, description, tags, visibility, created_at, updated_at")
      .single();

    if (error || !list) {
      return NextResponse.json(
        { error: "Failed to update list", details: error?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ list });
  } catch (err: any) {
    console.error("PUT /api/lists/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("contact_lists")
      .delete()
      .eq("id", params.id)
      .eq("workspace_id", workspaceId);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete list", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/lists/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}





















































