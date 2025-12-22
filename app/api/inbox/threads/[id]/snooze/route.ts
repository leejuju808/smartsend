import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type SnoozeBody = {
  until: string; // ISO timestamp
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => ({}))) as SnoozeBody;
  if (!payload.until) {
    return NextResponse.json({ error: "until timestamp required" }, { status: 400 });
  }

  const untilDate = new Date(payload.until);
  if (Number.isNaN(untilDate.getTime())) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }

  // Get thread with lead_id
  const { data: thread, error: threadError } = await supabase
    .from("reply_threads")
    .select("lead_id, account_id, campaign_id, owner_id")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Update thread snoozed_until and status
  const { error: updateError } = await supabase
    .from("reply_threads")
    .update({
      snoozed_until: untilDate.toISOString(),
      status: "snoozed",
    })
    .eq("id", threadId);

  if (updateError) {
    console.error("Snooze thread failed", updateError);
    return NextResponse.json({ error: "Failed to snooze thread" }, { status: 500 });
  }

  // Get lead for workspace_id
  const { data: lead } = await supabase
    .from("leads")
    .select("workspace_id, company_id")
    .eq("id", thread.lead_id)
    .single();

  // Log activity
  if (lead?.workspace_id) {
    await supabase.from("lead_activity").insert({
      workspace_id: lead.workspace_id,
      lead_id: thread.lead_id,
      type: "manual",
      title: "Thread snoozed",
      body: `Snoozed until ${untilDate.toLocaleString()}`,
      metadata: {
        thread_id: threadId,
        snoozed_until: untilDate.toISOString(),
        user_id: user.id,
      },
    });

    await supabase.from("team_activity").insert({
      workspace_id: lead.workspace_id,
      user_id: user.id,
      lead_id: thread.lead_id,
      company_id: lead.company_id,
      campaign_id: thread.campaign_id,
      type: "manual",
      title: "Thread snoozed",
      body: `Snoozed until ${untilDate.toLocaleString()}`,
      metadata: {
        thread_id: threadId,
        snoozed_until: untilDate.toISOString(),
      },
    });
  }

  return NextResponse.json({ ok: true, until: untilDate.toISOString() });
}








