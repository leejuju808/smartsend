import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { loadThreadForUser } from "../../../_lib";

type RemoveTagBody = {
  tag: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("remove tag thread auth lookup failed", userError);
    return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "missing_thread_id" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => ({}))) as RemoveTagBody;
  if (!payload.tag || typeof payload.tag !== "string") {
    return NextResponse.json({ error: "tag_required" }, { status: 400 });
  }

  const result = await loadThreadForUser(supabase, user.id, threadId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  const { error: rpcError } = await supabase.rpc("remove_tag_from_thread", {
    thread_id: threadId,
    tag_to_remove: payload.tag.trim(),
  });

  if (rpcError) {
    console.error("remove tag thread RPC failed", rpcError);
    return NextResponse.json({ error: "remove_tag_failed" }, { status: 500 });
  }

  const { error: activityError } = await supabase.from("activities").insert({
    account_id: result.thread.account_id,
    lead_id: result.thread.lead_id,
    thread_id: threadId,
    campaign_id: result.thread.campaign_id,
    kind: "thread_tag_removed",
    payload: {
      thread_id: threadId,
      tag: payload.tag,
      removed_by: user.id,
    },
  });

  if (activityError) {
    console.warn("remove tag thread activity insert failed", activityError);
  }

  return NextResponse.json({ ok: true });
}










