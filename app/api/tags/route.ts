// Block 11000 — Tags API
// GET /api/tags - List all tags for workspace
// POST /api/tags - Create a new tag
// DELETE /api/tags/[tag] - Delete a tag

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

// GET /api/tags - List all tags for workspace
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
    const search = searchParams.get("search") || "";

    // Get tags with usage counts
    let query = supabase
      .from("org_tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("usage_count", { ascending: false })
      .order("tag", { ascending: true });

    if (search) {
      query = query.ilike("tag", `%${search}%`);
    }

    const { data: tags, error } = await query;

    if (error) {
      console.error("Error fetching tags:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tags: tags || [] });
  } catch (error: any) {
    console.error("Error in GET /api/tags:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/tags - Create a new tag
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
    const { tag, color } = body;

    if (!tag || typeof tag !== "string" || tag.trim().length === 0) {
      return NextResponse.json(
        { error: "Tag name is required" },
        { status: 400 }
      );
    }

    // Create or update tag
    const { data, error } = await supabase
      .from("org_tags")
      .upsert({
        workspace_id: workspaceId,
        tag: tag.trim().toLowerCase(),
        color: color || "gray",
        created_by: user.id,
      }, {
        onConflict: "workspace_id,tag",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating tag:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/tags:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
