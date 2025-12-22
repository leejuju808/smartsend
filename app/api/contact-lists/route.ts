// GET /api/contact-lists - Get contact lists for current workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    // Get contact lists
    const { data: lists, error } = await supabase
      .from("contact_lists")
      .select("id, name, description, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching contact lists:", error);
      return NextResponse.json({ lists: [] }, { status: 200 });
    }

    return NextResponse.json({ lists: lists || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/contact-lists:", error);
    return NextResponse.json({ lists: [] }, { status: 200 });
  }
}

// POST /api/contact-lists - Create a new contact list
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "List name is required" },
        { status: 400 }
      );
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

    // Create contact list
    const { data: list, error } = await supabase
      .from("contact_lists")
      .insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description || null,
      })
      .select("id, name")
      .single();

    if (error) {
      console.error("Error creating contact list:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create list" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, listId: list.id, listName: list.name },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/contact-lists:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
