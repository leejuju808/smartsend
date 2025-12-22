import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);

  // Authentication check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  // Parse query parameters
  const search = url.searchParams.get("search");
  const owner = url.searchParams.get("owner");
  const tag = url.searchParams.get("tag");
  const company = url.searchParams.get("company");
  const score = url.searchParams.get("score"); // score bucket: hot, warm, cool, cold
  const reachability = url.searchParams.get("reachability"); // unknown, valid, risky, invalid
  const date = url.searchParams.get("date"); // ISO date string or date range
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const sortKey = url.searchParams.get("sortKey") ?? "created_at";
  const sortAsc = url.searchParams.get("sortAsc") === "true";

  // Build query
  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  // Apply filters
  if (search) {
    const searchPattern = `%${search}%`;
    query = query.or(
      `email.ilike.${searchPattern},company.ilike.${searchPattern},first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},title.ilike.${searchPattern}`
    );
  }

  if (owner) {
    if (owner === "unassigned") {
      query = query.is("owner_id", null);
    } else {
      query = query.eq("owner_id", owner);
    }
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

  if (company) {
    query = query.ilike("company", `%${company}%`);
  }

  if (score) {
    // score can be a bucket (hot, warm, cool, cold) or a numeric range
    if (["hot", "warm", "cool", "cold"].includes(score)) {
      query = query.eq("score_bucket", score);
    } else {
      // Numeric score filter (e.g., "50+" means >= 50)
      const scoreNum = Number(score);
      if (!isNaN(scoreNum)) {
        query = query.gte("score", scoreNum);
      }
    }
  }

  if (reachability) {
    query = query.eq("reachability", reachability);
  }

  if (date) {
    // Support date ranges: "2024-01-01,2024-01-31" or single date "2024-01-01"
    const [from, to] = date.split(",");
    if (to) {
      query = query.gte("created_at", from).lte("created_at", to + "T23:59:59Z");
    } else {
      query = query.gte("created_at", from + "T00:00:00Z").lte("created_at", from + "T23:59:59Z");
    }
  }

  // Apply sorting
  query = query.order(sortKey, { ascending: sortAsc });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}


