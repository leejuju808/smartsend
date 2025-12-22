import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  // Auth
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  // Workspace via membership
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
  const label = url.searchParams.get("label"); // e.g. positive / negative / unsubscribe / bounce / out_of_office / neutral / other
  const q = url.searchParams.get("q") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitParam || "50", 10) || 50, 10),
    200
  );

  let query = supabase
    .from("reply_logs")
    .select(
      "id, workspace_id, lead_id, campaign_id, subject, body_plain, from_email, received_at, ai_label, ai_intent_summary, ai_meeting_intent, ai_confidence"
    )
    .eq("workspace_id", workspaceId)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (label && label !== "all") {
    query = query.eq("ai_label", label);
  }

  if (q && q.trim().length > 0) {
    const like = `%${q.trim()}%`;
    query = query.or(
      `subject.ilike.${like},body_plain.ilike.${like},from_email.ilike.${like}`
    );
  }

  const { data, error } = await query;

    if (error) {
    console.error("[api.replies] query error", error);
    return Response.json({ error: "query_failed" }, { status: 500 });
  }

  return Response.json(
    {
      replies: data ?? [],
    },
    { status: 200 }
  );
}
