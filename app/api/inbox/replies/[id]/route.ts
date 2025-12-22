import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const replyId = params.id;

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  // Resolve workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  const { data, error } = await supabase
    .from("reply_logs")
    .select(
      `
      id,
      workspace_id,
      subject,
      received_at,
      body_html,
      body_text,
      body,
      ai_category,
      ai_intent,
      ai_has_meeting,
      ai_stop_followups,
      status,
      owner_user_id,
      meeting_stage,
      deal_value_cents,
      meeting_note,
      leads ( email )
    `
    )
    .eq("id", replyId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[inbox.replies.detail] query error", error);
    return Response.json({ error: "query_failed" }, { status: 400 });
  }

  if (!data) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // Transform the data to match the expected format
  // Handle leads as either object or array (Supabase can return either)
  const leadsData = Array.isArray(data.leads) ? data.leads[0] : data.leads;
  const leadEmail = (leadsData as any)?.email || null;

  const reply = {
    id: data.id,
    workspace_id: data.workspace_id,
    lead_email: leadEmail,
    subject: data.subject,
    received_at: data.received_at,
    body_html: data.body_html || null,
    body_text: data.body_text || (data.body || null),
    ai_category: data.ai_category,
    ai_intent: data.ai_intent,
    ai_has_meeting: data.ai_has_meeting,
    ai_stop_followups: data.ai_stop_followups,
    status: data.status,
    owner_user_id: data.owner_user_id,
    meeting_stage: data.meeting_stage,
    deal_value_cents: data.deal_value_cents,
    meeting_note: data.meeting_note,
  };

  return Response.json(
    {
      reply,
    },
    { status: 200 }
  );
}

