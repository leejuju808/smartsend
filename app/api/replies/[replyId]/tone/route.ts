import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const TONES = ["formal", "casual", "humorous", "assertive"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: { replyId: string } },
) {
  const { replyId } = params;
  if (!replyId) {
    return NextResponse.json({ error: "missing_reply_id" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const payload = await req.json().catch(() => ({}));
  const tone = payload?.tone as (typeof TONES)[number] | undefined;

  if (!tone || !TONES.includes(tone)) {
    return NextResponse.json({ error: "invalid tone" }, { status: 400 });
  }

  const { data: reply, error: replyError } = await supabase
    .from("inbound_messages")
    .select("id, account_id, campaign_id, lead_id, text_body, snippet")
    .eq("id", replyId)
    .maybeSingle();

  if (replyError || !reply) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const replyText = reply.text_body ?? reply.snippet ?? "";

  const { error: upsertError } = await supabase
    .from("reply_training_labels")
    .upsert(
      {
        reply_id: reply.id,
        account_id: reply.account_id,
        campaign_id: reply.campaign_id,
        contact_id: reply.lead_id,
        reply_text: replyText,
        tone,
        labeled_at: new Date().toISOString(),
      },
      { onConflict: "reply_id" },
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tone });
}

















