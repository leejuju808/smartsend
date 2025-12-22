// Block 12900 — SmartSend List Builder Tools v1
// GET /api/lists - Get all lists for the current workspace
// POST /api/lists - Create a new list

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ lists: [] }, { status: 200 });
    }

    // Get search query if provided
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim();

    // Build query
    let query = supabase
      .from("contact_lists")
      .select("id, name, description, tags, visibility, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    // Apply search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: lists, error } = await query;

    if (error) {
      console.error("Error fetching lists:", error);
      return NextResponse.json(
        { error: "Failed to fetch lists", details: error.message },
        { status: 500 }
      );
    }

    // Get contact counts and tags for each list
    const listsWithCounts = await Promise.all(
      (lists || []).map(async (list) => {
        const { count } = await supabase
          .from("contact_list_members")
          .select("*", { count: "exact", head: true })
          .eq("list_id", list.id);

        // Get unique tags from contacts in this list
        const { data: contacts } = await supabase
          .from("contact_list_members")
          .select("contacts!inner(tags)")
          .eq("list_id", list.id)
          .limit(100);

        const allTags = new Set<string>();
        contacts?.forEach((c: any) => {
          if (c.contacts?.tags && Array.isArray(c.contacts.tags)) {
            c.contacts.tags.forEach((tag: string) => allTags.add(tag));
          }
        });

        return {
          ...list,
          contact_count: count || 0,
          tags_in_list: Array.from(allTags).slice(0, 10), // Limit to 10 tags
        };
      })
    );

    return NextResponse.json({ lists: listsWithCounts }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/lists error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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
    const { name, description, tag, visibility } = body as {
      name: string;
      description?: string;
      tag?: string;
      visibility?: "everyone" | "owner_manager";
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "List name is required" },
        { status: 400 }
      );
    }

    const { data: list, error } = await supabase
      .from("contact_lists")
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description?.trim() || null,
        tags: tag ? [tag] : [],
        visibility: visibility || "everyone",
      })
      .select("id, name, description, tags, visibility, created_at, updated_at")
      .single();

    if (error) {
      console.error("Error creating list:", error);
      return NextResponse.json(
        { error: "Failed to create list", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { list: { ...list, contact_count: 0, tags_in_list: [] } },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/lists error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
