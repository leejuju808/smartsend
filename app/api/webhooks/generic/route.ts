import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/sb';
import type { NormalizedEvent } from '@/lib/webhook-types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const events = Array.isArray(body) ? body : [body]; // allow single or batch
    const supabase = admin();

    for (const e of events) {
      const n: NormalizedEvent = {
        provider: (e.provider ?? 'generic') as 'generic',
        event_type: e.event_type,
        message_id: e.message_id ?? null,
        queue_id: e.queue_id ?? null,
        account_id: e.account_id ?? null,
        campaign_id: e.campaign_id ?? null,
        recipient: e.recipient ?? null,
        code: e.code ?? null,
        reason: e.reason ?? null,
        payload: e
      };

      const { error } = await supabase.rpc('ingest_provider_event', {
        p_provider: n.provider,
        p_event_type: n.event_type,
        p_message_id: n.message_id,
        p_queue_id: n.queue_id,
        p_account_id: n.account_id,
        p_campaign_id: n.campaign_id,
        p_recipient: n.recipient,
        p_code: n.code,
        p_reason: n.reason,
        p_payload: n.payload
      });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}














