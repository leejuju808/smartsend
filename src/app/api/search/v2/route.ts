// Block 14100 — SmartSend Search v2 API
// GET /api/search/v2?query=...&filters=...
// Advanced search with filtering by status, score, tags, location, lists, storm exposure, email activity, and tasks

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  // Get current user
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

  // Parse query parameters
  const url = new URL(req.url);
  const query = url.searchParams.get("query") || null;
  const filtersParam = url.searchParams.get("filters");
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"));

  // Parse filters JSON
  let filters: any = {};
  if (filtersParam) {
    try {
      filters = JSON.parse(filtersParam);
    } catch (e) {
      return NextResponse.json({ error: "Invalid filters JSON" }, { status: 400 });
    }
  }

  // Call the search function
  const { data, error } = await supabase.rpc("search_contacts_v2", {
    p_workspace_id: workspaceId,
    p_query: query,
    p_filters: filters,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("Search v2 error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Extract total count from first row (if exists)
  const totalCount = data && data.length > 0 ? (data[0] as any).total_count || 0 : 0;

  // Remove total_count from each row
  const results = (data || []).map((row: any) => {
    const { total_count, ...rest } = row;
    return rest;
  });

  return NextResponse.json({
    ok: true,
    results,
    total: totalCount,
    limit,
    offset,
  });
}





















































