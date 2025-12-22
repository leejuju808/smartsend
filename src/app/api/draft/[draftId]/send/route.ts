import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: NextRequest, { params }: { params: { draftId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: draft, error } = await supabase
    .from("reply_drafts")
    .select("id, campaign_id, thread_id, lead_id, status")
    .eq("id", params.draftId)
    .maybeSingle();

  if (error || !draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!draft.thread_id || !draft.lead_id || !draft.campaign_id) {
    return NextResponse.json({ error: "Incomplete draft" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("send_queue")
    .select("id")
    .eq("draft_id", draft.id)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from("send_queue").insert({
      draft_id: draft.id,
      campaign_id: draft.campaign_id,
      thread_id: draft.thread_id,
      lead_id: draft.lead_id,
      priority: 3,
      kind: "reply",
    });
  }

  await supabase
    .from("reply_drafts")
    .update({ status: "queued", queued_at: new Date().toISOString() })
    .eq("id", draft.id);

  return NextResponse.json({ ok: true });
}


