import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/sb";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("validationToken");
  if (token) {
    return new NextResponse(token, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const supabase = admin();
  const b = await req.json().catch(() => null);

  // Graph validation (subscription handshake)
  if (b && b.validationToken) {
    return new NextResponse(b.validationToken, { status: 200 });
  }

  // Legacy webhook_events logging (backward compatibility)
  await supabase
    .from("webhook_events")
    .insert({ source: "outlook", event_type: "message", body: b })
    .catch(() => null);

  // Accept normalized events directly OR lightweight shorthand:
  // { type: 'bounce', internetMessageId, to, code, reason, accountId, campaignId, queueId }
  const events = Array.isArray(b) ? b : Array.isArray(b?.value) ? b.value : [b];

  for (const e of events) {
    const event_type = (e.event_type ?? e.type ?? 'other') as string;
    
    // Extract message_id from various possible locations
    const message_id = e.message_id ?? e.internetMessageId ?? 
      e.resourceData?.id ?? 
      e.id ?? 
      null;

    const { error } = await supabase.rpc('ingest_provider_event', {
      p_provider: 'outlook',
      p_event_type: event_type,
      p_message_id: message_id,
      p_queue_id: e.queue_id ?? null,
      p_account_id: e.account_id ?? null,
      p_campaign_id: e.campaign_id ?? null,
      p_recipient: e.recipient ?? e.to ?? 
        e.resourceData?.toRecipients?.[0]?.emailAddress?.address ?? null,
      p_code: e.code ?? null,
      p_reason: e.reason ?? e.status ?? null,
      p_payload: e
    });
    if (error) {
      console.error('Outlook webhook ingest error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
