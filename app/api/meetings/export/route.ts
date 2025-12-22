import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toCsvValue(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    // escape quotes and wrap in quotes
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return new Response("not_auth", { status: 401 });
  }

  // Resolve workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return new Response("no_workspace", { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Fetch all meeting-intent replies
  const { data, error } = await supabase
    .from("reply_logs")
    .select(
      `
      id,
      workspace_id,
      lead_email,
      subject,
      received_at,
      ai_category,
      ai_intent,
      ai_has_meeting,
      ai_stop_followups,
      status,
      owner_user_id,
      meeting_stage,
      deal_value_cents,
      meeting_note
    `
    )
    .eq("workspace_id", workspaceId)
    .eq("ai_has_meeting", true)
    .order("received_at", { ascending: false });

  if (error) {
    console.error("[meetings.export] query error", error);
    return new Response("query_failed", { status: 400 });
  }

  const rows = data || [];

  const header = [
    "reply_id",
    "workspace_id",
    "lead_email",
    "subject",
    "received_at",
    "ai_category",
    "ai_intent",
    "ai_has_meeting",
    "ai_stop_followups",
    "status",
    "owner_user_id",
    "meeting_stage",
    "deal_value_usd",
    "meeting_note",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of rows) {
    const dealValueUsd =
      r.deal_value_cents != null
        ? (r.deal_value_cents / 100).toFixed(2)
        : "";

    const line = [
      toCsvValue(r.id),
      toCsvValue(r.workspace_id),
      toCsvValue(r.lead_email),
      toCsvValue(r.subject),
      toCsvValue(r.received_at),
      toCsvValue(r.ai_category),
      toCsvValue(r.ai_intent),
      toCsvValue(r.ai_has_meeting ? "true" : "false"),
      toCsvValue(r.ai_stop_followups ? "true" : "false"),
      toCsvValue(r.status),
      toCsvValue(r.owner_user_id),
      toCsvValue(r.meeting_stage),
      toCsvValue(dealValueUsd),
      toCsvValue(r.meeting_note),
    ].join(",");

    lines.push(line);
  }

  const csv = lines.join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="smartsend_meetings_export.csv"',
    },
  });
}





