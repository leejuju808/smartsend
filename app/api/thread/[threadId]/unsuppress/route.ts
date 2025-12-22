import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error: threadErr } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,lead_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const note = body?.note;

  let suppressionQuery = supabase
    .from("lead_suppressions")
    .delete()
    .eq("lead_id", thread.lead_id);

  if (thread.campaign_id) {
    suppressionQuery = suppressionQuery.or(
      `campaign_id.is.null,campaign_id.eq.${thread.campaign_id}`
    );
  } else {
    suppressionQuery = suppressionQuery.is("campaign_id", null);
  }

  const deleteResp = await suppressionQuery;

  if (deleteResp.error) {
    return NextResponse.json({ error: deleteResp.error.message }, { status: 500 });
  }

  const updateResp = await supabase
    .from("leads")
    .update({ is_suppressed: false, suppressed_at: null })
    .eq("id", thread.lead_id);

  if (updateResp.error) {
    return NextResponse.json({ error: updateResp.error.message }, { status: 500 });
  }

  const eventResp = await supabase.from("suppression_events").insert({
    campaign_id: thread.campaign_id,
    thread_id: thread.id,
    lead_id: thread.lead_id,
    event: "manual_unsuppress",
    detail: note ?? "Manual unsuppress",
  });

  if (eventResp.error) {
    return NextResponse.json({ error: eventResp.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

