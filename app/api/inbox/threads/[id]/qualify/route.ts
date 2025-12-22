import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type QualifyBody = {
  qualification_status: "hot" | "warm" | "cold" | "not_fit";
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

  const payload = (await req.json().catch(() => ({}))) as QualifyBody;
  if (!payload.qualification_status || !["hot", "warm", "cold", "not_fit"].includes(payload.qualification_status)) {
    return NextResponse.json({ error: "Invalid qualification_status" }, { status: 400 });
  }

  // Get thread with lead_id
  const { data: thread, error: threadError } = await supabase
    .from("reply_threads")
    .select("lead_id, account_id, campaign_id")
    .eq("id", threadId)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get lead to check workspace_id
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id, company_id")
    .eq("id", thread.lead_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Update lead qualification_status and score
  const { error: updateError } = await supabase.rpc("bump_lead_score_from_qualification", {
    p_lead_id: thread.lead_id,
    p_qualification_status: payload.qualification_status,
  });

  if (updateError) {
    console.error("Qualify lead failed", updateError);
    return NextResponse.json({ error: "Failed to qualify lead" }, { status: 500 });
  }

  // Log activity
  const activityTitle = `Lead qualified as ${payload.qualification_status.charAt(0).toUpperCase() + payload.qualification_status.slice(1)} via Inbox`;
  
  // Log to lead_activity
  if (lead.workspace_id) {
    await supabase.from("lead_activity").insert({
      workspace_id: lead.workspace_id,
      lead_id: thread.lead_id,
      type: "manual",
      title: activityTitle,
      body: `Qualified via Inbox Command Bar`,
      metadata: {
        qualification_status: payload.qualification_status,
        thread_id: threadId,
        user_id: user.id,
      },
    });

    // Log to team_activity
    await supabase.from("team_activity").insert({
      workspace_id: lead.workspace_id,
      user_id: user.id,
      lead_id: thread.lead_id,
      company_id: lead.company_id,
      campaign_id: thread.campaign_id,
      type: "manual",
      title: activityTitle,
      body: `Qualified via Inbox Command Bar`,
      metadata: {
        qualification_status: payload.qualification_status,
        thread_id: threadId,
      },
    });
  }

  return NextResponse.json({ ok: true, qualification_status: payload.qualification_status });
}








