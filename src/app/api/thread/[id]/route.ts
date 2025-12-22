// app/api/thread/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = params.id;

  const nowIso = new Date().toISOString();
  const now = new Date(nowIso);

  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id, subject, stopped_by_reply, updated_at, campaign_id, lead_id")
    .eq("id", id)
    .maybeSingle();

  const { data: messages } = await supabase
    .from("inbox_messages")
    .select("id, created_at, direction, from_email, to_email, body_html, body_text, ai_label, ai_confidence")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  let quietHours: { active: boolean; next_allowed_at: string | null } | null = null;

  if (thread?.campaign_id && thread?.lead_id) {
    const { data: nextAllowed, error } = await supabase.rpc("next_allowed_send_at", {
      p_campaign: thread.campaign_id,
      p_lead: thread.lead_id,
      p_from: nowIso,
    });

    if (!error && nextAllowed) {
      const nextDate = new Date(nextAllowed as string);
      quietHours = {
        active: nextDate.getTime() > now.getTime(),
        next_allowed_at: nextAllowed as string,
      };
    }
  }

  return NextResponse.json(
    { thread, messages, quiet_hours: quietHours },
    { headers: { "content-type": "application/json" } },
  );
}

