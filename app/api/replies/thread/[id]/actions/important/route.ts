import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { loadThreadForUser } from "../../../_lib";

type ImportantBody = {
  important?: boolean;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("mark important thread auth lookup failed", userError);
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

  const payload = (await req.json().catch(() => ({}))) as ImportantBody;
  const isImportant = payload.important !== undefined ? payload.important : true;

  const { error: updateError } = await supabase
    .from("reply_threads")
    .update({ important: isImportant })
    .eq("id", threadId);

  if (updateError) {
    console.error("mark important thread update failed", updateError);
    return NextResponse.json({ error: "mark_important_failed" }, { status: 500 });
  }

  const { error: activityError } = await supabase.from("activities").insert({
    account_id: result.thread.account_id,
    lead_id: result.thread.lead_id,
    thread_id: threadId,
    campaign_id: result.thread.campaign_id,
    kind: isImportant ? "thread_marked_important" : "thread_unmarked_important",
    payload: {
      thread_id: threadId,
      marked_by: user.id,
      important: isImportant,
    },
  });

  if (activityError) {
    console.warn("mark important thread activity insert failed", activityError);
  }

  return NextResponse.json({ ok: true, important: isImportant });
}










