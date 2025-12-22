import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const {
    leadId,
    campaignId,
    status,
    meetingAt,
    notes,
  } = body as {
    leadId?: string;
    campaignId?: string;
    status?: "pending" | "booked" | "completed" | "no_show" | "canceled";
    meetingAt?: string | null;
    notes?: string | null;
  };

  if (!leadId || !campaignId || !status) {
    return Response.json(
      { error: "missing_fields" },
      { status: 400 }
    );
  }

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

  // Try to parse meetingAt if provided
  let parsedMeetingAt: string | null = null;
  if (meetingAt && meetingAt.trim()) {
    try {
      const parsed = new Date(meetingAt);
      if (!isNaN(parsed.getTime())) {
        parsedMeetingAt = parsed.toISOString();
      }
    } catch {
      // If parsing fails, leave as null
      parsedMeetingAt = null;
    }
  }

  const { data, error } = await supabase
    .from("reply_thread_meeting")
    .upsert(
      {
        workspace_id: workspaceId,
        lead_id: leadId,
        campaign_id: campaignId,
        status,
        meeting_at: parsedMeetingAt,
        notes: notes ?? null,
        updated_by: user.id,
        created_by: user.id, // ignored on update
      },
      {
        onConflict: "workspace_id,lead_id,campaign_id",
      }
    )
    .select("workspace_id, lead_id, campaign_id, status, meeting_at, notes")
    .single();

  if (error) {
    console.error("meeting update error", error);
    return Response.json({ error: "update_failed" }, { status: 400 });
  }

  return Response.json({ meeting: data }, { status: 200 });
}

