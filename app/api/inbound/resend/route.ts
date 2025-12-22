import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, from, subject, text } = body;

    const match = /reply\+(.+)_(.+)@/i.exec((to?.[0] || '').toString());
    if (!match) return NextResponse.json({ error: 'address parse failed' }, { status: 400 });
    const campaign_id = match[1];
    const lead_id = match[2];

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/reply-detection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.REPLY_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({ campaign_id, lead_id, subject, text, from_email: from })
    });

    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Resend inbound payload shape: { to, from, subject, text, html, headers, ... }
    const { to, from, subject, text } = body;

    // Parse campaign_id and lead_id from plus-address, e.g., reply+<campaignId>_<leadId>@yourdomain.com
    const match = /reply\+(.+)_(.+)@/i.exec((to?.[0] || '').toString());
    if (!match) return NextResponse.json({ error: 'address parse failed' }, { status: 400 });
    const campaign_id = match[1];
    const lead_id = match[2];

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/reply-detection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.REPLY_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({ campaign_id, lead_id, subject, text, from_email: from })
    });

    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


