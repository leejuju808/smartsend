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
  const status = url.searchParams.get("status") || "";
  const range = url.searchParams.get("range") || "upcoming"; // upcoming | past7 | past30 | all
  const campaignId = url.searchParams.get("campaignId") || "";
  const q = url.searchParams.get("q")?.trim() || "";

  let meetingQuery = supabase
    .from("reply_thread_meeting")
    .select(
      `
      workspace_id,
      lead_id,
      campaign_id,
      status,
      meeting_at,
      notes,
      leads:leads(
        email,
        company,
        first_name,
        last_name
      ),
      campaigns:campaigns(
        name
      )
    `
    )
    .eq("workspace_id", workspaceId);

  if (status) {
    meetingQuery = meetingQuery.eq("status", status);
  }

  if (campaignId) {
    meetingQuery = meetingQuery.eq("campaign_id", campaignId);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  if (range === "upcoming") {
    // meeting_at in the future (or null — we can choose to include null as "unscheduled")
    meetingQuery = meetingQuery.or(`meeting_at.gte.${nowIso},meeting_at.is.null`);
  } else if (range === "past7") {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    meetingQuery = meetingQuery
      .gte("meeting_at", since.toISOString())
      .lte("meeting_at", nowIso);
  } else if (range === "past30") {
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    meetingQuery = meetingQuery
      .gte("meeting_at", since.toISOString())
      .lte("meeting_at", nowIso);
  } // "all" => no additional filter

  const { data, error } = await meetingQuery.order("meeting_at", {
    ascending: true,
    nullsFirst: true,
  });

  if (error) {
    console.error("meetings pipeline query error", error);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  // naive in-memory search
  let rows = data || [];
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter((row: any) => {
      const email = row.leads?.email?.toLowerCase() || "";
      const company = row.leads?.company?.toLowerCase() || "";
      const campaignName = row.campaigns?.name?.toLowerCase() || "";
      return (
        email.includes(lower) ||
        company.includes(lower) ||
        campaignName.includes(lower)
      );
    });
  }

  return Response.json(
    {
      meetings: rows,
    },
    { status: 200 }
  );
}
