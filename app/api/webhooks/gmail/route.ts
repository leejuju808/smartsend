import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/sb";

export async function POST(req: NextRequest) {
  const supabase = admin();
  const b = await req.json().catch(() => null);

  // Legacy webhook_events logging (backward compatibility)
  await supabase
    .from("webhook_events")
    .insert({ source: "gmail", event_type: "history", body: b })
    .catch(() => null);

  // Accept normalized events directly OR lightweight shorthand:
  // { type: 'bounce', messageId, to, code, reason, accountId, campaignId, queueId }
  const events = Array.isArray(b) ? b : [b];

  for (const e of events) {
    const event_type = (e.event_type ?? e.type ?? 'other') as string;
    
    // Extract message_id from various possible locations
    const message_id = e.message_id ?? e.messageId ?? 
      e.message?.data?.id ?? 
      e.message?.messageId ?? 
      e.id ?? 
      null;

    const { error } = await supabase.rpc('ingest_provider_event', {
      p_provider: 'gmail',
      p_event_type: event_type,
      p_message_id: message_id,
      p_queue_id: e.queue_id ?? e.queueId ?? null,
      p_account_id: e.account_id ?? e.accountId ?? null,
      p_campaign_id: e.campaign_id ?? e.campaignId ?? null,
      p_recipient: e.recipient ?? e.to ?? e.emailAddress ?? null,
      p_code: e.code ?? null,
      p_reason: e.reason ?? null,
      p_payload: e
    });
    if (error) {
      console.error('Gmail webhook ingest error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
