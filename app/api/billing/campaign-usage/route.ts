import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100)
    : 20;

  // Pull from view, then fetch campaign names separately
  // (Views don't support FK relationships in Supabase queries)
  const { data: usageData, error: usageError } = await supabase
    .from("campaign_usage_30d")
    .select("campaign_id, sends_30d, replies_30d")
    .eq("workspace_id", workspaceId)
    .order("sends_30d", { ascending: false })
    .limit(limit);

  if (usageError || !usageData) {
    console.error("[billing.campaign-usage] query error", usageError);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  // Fetch campaign names separately
  const campaignIds = usageData.map((row) => row.campaign_id).filter(Boolean);
  const campaignNamesMap = new Map<string, string>();

  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", campaignIds)
      .eq("workspace_id", workspaceId);

    campaigns?.forEach((c) => {
      campaignNamesMap.set(c.id, c.name);
    });
  }

  const rows = usageData.map((row) => ({
    campaign_id: row.campaign_id,
    name: campaignNamesMap.get(row.campaign_id) || "Untitled campaign",
    sends_30d: row.sends_30d,
    replies_30d: row.replies_30d,
  }));

  return Response.json(
    {
      campaigns: rows,
    },
    { status: 200 }
  );
}

