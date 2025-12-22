import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const queueId = req.nextUrl.searchParams.get('q'); // optional queue id
  const leadId = params.leadId;

  try {
    // Record the open
    await supabase.from('email_opens').insert({
      queue_id: queueId ?? null,
      ua: req.headers.get('user-agent') ?? '',
      ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0] ?? null
    });

    // Log the event
    await supabase.from('smartsend_campaign_logs').insert({
      campaign_id: null,
      lead_id: leadId,
      event_type: 'open',
      details: { queue_id: queueId, timestamp: new Date().toISOString() }
    });
  } catch (e) {
    console.error('Error tracking open:', e);
  }

  // Return 1x1 transparent PNG
  const png = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 44, 10, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
  ]);

  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}
