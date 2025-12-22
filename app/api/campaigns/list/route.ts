import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "true";
  const scope = url.searchParams.get("scope") || "all"; // "my" | "team" | "all"

  // workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  let query = supabase
    .from("campaigns")
    .select(
      `
      id,
      workspace_id,
      name,
      status,
      sequence_id,
      is_shared,
      created_by,
      created_at,
      updated_at,
      profiles:created_by (
        id,
        full_name
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (activeOnly) {
    query = query.in("status", ["draft", "scheduled", "running"]);
  }

  // Apply sharing rules: include campaigns with is_shared=true OR created_by=current_user.id
  // This ensures users see:
  // - All shared campaigns (is_shared=true)
  // - Their own private campaigns (created_by=user.id, even if is_shared=false)
  query = query.or(`is_shared.eq.true,created_by.eq.${user.id}`);

  if (scope === "my") {
    // Filter to only campaigns owned by current user
    query = query.eq("created_by", user.id);
  } else if (scope === "team") {
    // "Team campaigns" = shared campaigns (is_shared=true)
    query = query.eq("is_shared", true);
  }
  // scope === "all" shows everything (already filtered by sharing rule above)

  const { data, error } = await query;

  if (error) {
    console.error("campaign list error", error);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  return Response.json({ 
    campaigns: data || [],
    currentUserId: user.id 
  }, { status: 200 });
}
