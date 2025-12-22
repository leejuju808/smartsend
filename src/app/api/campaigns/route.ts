import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = url.searchParams.get("filter") || "all"; // all|owned|shared|archived
  const ownerId = url.searchParams.get("owner_id"); // Filter by specific owner
  const status = url.searchParams.get("status"); // Filter by status (draft|running|paused|completed)
  const visibility = url.searchParams.get("visibility"); // Filter by visibility (workspace|restricted)
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") || "20"), 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let query = supabase
    .from("v_campaign_access")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);

  // Tab filters
  if (filter === "owned") {
    query = query.eq("owner_id", user.id).is("deleted_at", null);
  } else if (filter === "shared") {
    query = query.neq("owner_id", user.id).is("deleted_at", null);
  } else if (filter === "archived") {
    query = query.not("deleted_at", "is", null);
  } else if (filter === "all") {
    query = query.is("deleted_at", null);
  }

  // Additional filters
  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (visibility) {
    query = query.eq("visibility", visibility);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
}