import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { loadThreadForUser } from "../../_lib";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("close thread auth lookup failed", userError);
    return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "missing_thread_id" }, { status: 400 });
  }

  const result = await loadThreadForUser(supabase, user.id, threadId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const { error: updateError } = await supabase
    .from("reply_threads")
    .update({ status: "closed", state: "closed", unread_count: 0 })
    .eq("id", threadId);

  if (updateError) {
    console.error("close thread update failed", updateError);
    return NextResponse.json({ error: "close_failed" }, { status: 500 });
  }

  const { error: slaError } = await supabase
    .from("reply_sla_states")
    .update({ first_met_at: new Date().toISOString() })
    .eq("thread_id", threadId);

  if (slaError) {
    console.warn("close thread SLA update failed", slaError);
  }

  const { error: activityError } = await supabase.from("activities").insert({
    account_id: result.thread.account_id,
    lead_id: result.thread.lead_id,
    thread_id: threadId,
    campaign_id: result.thread.campaign_id,
    kind: "thread_closed",
    payload: { thread_id: threadId, actor: user.id },
  });

  if (activityError) {
    console.warn("close thread activity insert failed", activityError);
  }

  return NextResponse.json({ ok: true });
}

