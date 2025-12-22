import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { loadThreadForUser } from "../../_lib";

type AssignBody = {
  owner_id?: string | null;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("assign thread auth lookup failed", userError);
    return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "missing_thread_id" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => ({}))) as AssignBody;
  if (!("owner_id" in payload)) {
    return NextResponse.json({ error: "owner_id_required" }, { status: 400 });
  }

  const result = await loadThreadForUser(supabase, user.id, threadId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const ownerId = payload.owner_id ?? null;

  if (ownerId) {
    const { data: validOwner, error: ownerError } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("account_id", result.thread.account_id)
      .eq("user_id", ownerId)
      .eq("is_active", true)
      .maybeSingle();

    if (ownerError) {
      console.error("assign thread owner check failed", ownerError);
      return NextResponse.json({ error: "owner_lookup_failed" }, { status: 500 });
    }

    if (!validOwner && ownerId !== result.thread.account_id) {
      return NextResponse.json({ error: "invalid_owner" }, { status: 400 });
    }
  }

  const { error: updateError } = await supabase
    .from("reply_threads")
    .update({ owner_id: ownerId, status: ownerId ? result.thread.status : "open" })
    .eq("id", threadId);

  if (updateError) {
    console.error("assign thread update failed", updateError);
    return NextResponse.json({ error: "assign_failed" }, { status: 500 });
  }

  const { error: activityError } = await supabase.from("activities").insert({
    account_id: result.thread.account_id,
    lead_id: result.thread.lead_id,
    thread_id: threadId,
    campaign_id: result.thread.campaign_id,
    kind: "thread_assigned",
    payload: {
      thread_id: threadId,
      assigned_to: ownerId,
      assigned_by: user.id,
    },
  });

  if (activityError) {
    console.warn("assign thread activity insert failed", activityError);
  }

  return NextResponse.json({ ok: true, owner_id: ownerId });
}

