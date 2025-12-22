// Block 14100 — SmartSend Search v2: Saved Searches API
// GET /api/search/saved - List saved searches
// POST /api/search/saved - Create saved search
// DELETE /api/search/saved?id=... - Delete saved search

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// GET - List saved searches
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Get saved searches (own + shared)
  const { data: savedSearches, error } = await supabase
    .from("saved_searches")
    .select("*")
    .or(`user_id.eq.${user.id},and(is_shared.eq.true,workspace_id.eq.${workspaceId})`)
    .order("last_used_at", { ascending: false, nullsLast: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching saved searches:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved_searches: savedSearches || [],
  });
}

// POST - Create saved search
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace ID
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  // Parse request body
  const body = await req.json().catch(() => ({}));
  const { name, description, query, filters, is_shared } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Create saved search
  const { data: savedSearch, error } = await supabase
    .from("saved_searches")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      name: name.trim(),
      description: description || null,
      query: query || null,
      filters: filters || {},
      is_shared: is_shared || false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating saved search:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved_search: savedSearch,
  });
}

// DELETE - Delete saved search
export async function DELETE(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get search ID from query params
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Search ID is required" }, { status: 400 });
  }

  // Delete saved search (only own searches)
  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id); // Ensure user can only delete their own searches

  if (error) {
    console.error("Error deleting saved search:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Saved search deleted",
  });
}





















































