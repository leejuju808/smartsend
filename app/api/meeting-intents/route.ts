// app/api/meeting-intents/route.ts

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type MeetingIntent =
  | "meeting_requested"
  | "meeting_confirmed"
  | "followup_needed";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  // Auth
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  // Workspace
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
  const intentParam = url.searchParams.get("intent"); // 'meeting_requested' | 'meeting_confirmed' | 'followup_needed' | 'all'
  const q = url.searchParams.get("q") || "";
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitParam || "100", 10) || 100, 10),
    300
  );

  // Base query: meeting-intent replies in this workspace
  // Assumes reply_logs has FKs:
  //   lead_id -> leads.id
  //   campaign_id -> campaigns.id
  let query = supabase
    .from("reply_logs")
    .select(
      `
      id,
      workspace_id,
      lead_id,
      campaign_id,
      from_email,
      subject,
      body_plain,
      received_at,
      ai_label,
      ai_intent_summary,
      ai_meeting_intent,
      ai_confidence,
      leads:lead_id (
        id,
        first_name,
        last_name,
        email,
        company
      ),
      campaigns:campaign_id (
        id,
        name
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .in("ai_meeting_intent", [
      "meeting_requested",
      "meeting_confirmed",
      "followup_needed",
    ] as MeetingIntent[])
    .order("received_at", { ascending: false })
    .limit(limit);

  if (intentParam && intentParam !== "all") {
    query = query.eq("ai_meeting_intent", intentParam);
  }

  if (q && q.trim().length > 0) {
    const like = `%${q.trim()}%`;
    // Filter across subject, summary, from_email (direct fields)
    // Note: Supabase .or() doesn't work with joined tables, so we'll filter nested relations in memory
    query = query.or(
      [
        `subject.ilike.${like}`,
        `ai_intent_summary.ilike.${like}`,
        `from_email.ilike.${like}`,
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[meeting-intents] query error", error);
    return Response.json({ error: "query_failed" }, { status: 500 });
  }

  let filteredData = data ?? [];

  // Filter by nested relation fields (leads email/company/name) in memory
  if (q && q.trim().length > 0 && filteredData.length > 0) {
    const searchLower = q.trim().toLowerCase();
    filteredData = filteredData.filter((item: any) => {
      const lead = item.leads;
      const subjectMatch = item.subject?.toLowerCase().includes(searchLower);
      const summaryMatch = item.ai_intent_summary?.toLowerCase().includes(searchLower);
      const fromEmailMatch = item.from_email?.toLowerCase().includes(searchLower);
      const leadEmailMatch = lead?.email?.toLowerCase().includes(searchLower);
      const leadCompanyMatch = lead?.company?.toLowerCase().includes(searchLower);
      const leadFirstNameMatch = lead?.first_name?.toLowerCase().includes(searchLower);
      const leadLastNameMatch = lead?.last_name?.toLowerCase().includes(searchLower);
      
      return (
        subjectMatch ||
        summaryMatch ||
        fromEmailMatch ||
        leadEmailMatch ||
        leadCompanyMatch ||
        leadFirstNameMatch ||
        leadLastNameMatch
      );
    });
  }

  return Response.json(
    {
      items: filteredData,
    },
    { status: 200 }
  );
}

