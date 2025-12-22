// Block 14100 — SmartSend Search v2: Update saved search and track usage
// PATCH /api/search/saved/[id] - Update saved search
// POST /api/search/saved/[id]/use - Track usage

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// PATCH - Update saved search
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Parse request body
  const body = await req.json().catch(() => ({}));
  const updates: any = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (body.description !== undefined) {
    updates.description = body.description || null;
  }

  if (body.query !== undefined) {
    updates.query = body.query || null;
  }

  if (body.filters !== undefined) {
    updates.filters = body.filters || {};
  }

  if (body.is_shared !== undefined) {
    updates.is_shared = body.is_shared || false;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  // Update saved search (only own searches)
  const { data: savedSearch, error } = await supabase
    .from("saved_searches")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating saved search:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!savedSearch) {
    return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    saved_search: savedSearch,
  });
}

// POST - Track usage (increment usage_count and update last_used_at)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Update usage tracking using RPC function
  const { error: rpcError } = await supabase.rpc("increment_saved_search_usage", {
    p_search_id: id,
  });

  if (rpcError) {
    // Fallback: fetch, increment, update
    const { data: current } = await supabase
      .from("saved_searches")
      .select("usage_count")
      .eq("id", id)
      .single();

    if (current) {
      const { error: fallbackError } = await supabase
        .from("saved_searches")
        .update({
          usage_count: (current.usage_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (fallbackError) {
        console.error("Error tracking usage:", fallbackError);
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
    } else {
      console.error("Error tracking usage:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Usage tracked",
  });
}

