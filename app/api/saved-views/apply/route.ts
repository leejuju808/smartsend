import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function POST(req: NextRequest) {
  const gate = await requireRole(["owner", "admin", "member", "viewer"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });

  const { viewId, page = 1, pageSize = 50 } = await req.json();

  if (!viewId) {
    return NextResponse.json({ error: "viewId_required" }, { status: 400 });
  }

  // Fetch view with filters and sort
  const { data: view, error: viewError } = await supabase
    .from("shared_resources")
    .select("filters, sort, scope, owner_id")
    .eq("id", viewId)
    .eq("kind", "saved_view")
    .single();

  if (viewError || !view) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Check access: if team scope, user must be in same team/account
  // For personal scope, only owner can access
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "not_auth" }, { status: 401 });
  }

  if (view.scope === "personal" && view.owner_id !== user.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Build query
  let query = supabase.from("leads").select("*", { count: "exact" });

  const filters = view.filters ?? {};

  // TAGS filter - leads.tags is an array, check if any tag in filters.tags matches
  if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
    query = query.overlaps("tags", filters.tags);
  }

  // STATUS filter
  if (filters.status && typeof filters.status === "string") {
    query = query.eq("status", filters.status);
  }

  // DATE ADDED filters
  if (filters.date_after && typeof filters.date_after === "string") {
    query = query.gte("created_at", filters.date_after);
  }

  if (filters.date_before && typeof filters.date_before === "string") {
    query = query.lte("created_at", filters.date_before);
  }

  // LAST CONTACTED filter (if last_contacted column exists)
  if (filters.last_contact_after && typeof filters.last_contact_after === "string") {
    // Note: This assumes a last_contacted column exists. If not, this will be ignored.
    query = query.gte("last_contacted", filters.last_contact_after);
  }

  // SEGMENT filter (if segment_id is provided)
  if (filters.segment_id && typeof filters.segment_id === "string") {
    // This would require joining with segment_leads or similar table
    // For now, we'll skip this as it requires more complex logic
    // TODO: Implement segment filtering
  }

  // CAMPAIGN ENGAGEMENT filter (if campaign_id is provided)
  if (filters.campaign_id && typeof filters.campaign_id === "string") {
    query = query.eq("campaign_id", filters.campaign_id);
  }

  // SORT
  const sort = view.sort ?? { field: "created_at", dir: "desc" };
  const sortField = sort.field || "created_at";
  const sortDir = sort.dir === "asc" ? true : false;
  query = query.order(sortField, { ascending: sortDir });

  // PAGINATION
  const offset = (page - 1) * pageSize;
  const { data, error, count } = await query.range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Error applying saved view:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    leads: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}












