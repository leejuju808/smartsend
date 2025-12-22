import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const campaignId = params.campaignId;
  const { leads, template, providerAccountId, startAt } = await req.json();

  // Validate required fields
  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
  }
  if (!template || !template.subject || !template.html) {
    return NextResponse.json({ error: 'Template missing subject or html' }, { status: 400 });
  }
  if (!providerAccountId) {
    return NextResponse.json({ error: 'Provider account ID required' }, { status: 400 });
  }

  // Fetch provider account
  const { data: acct, error: acctErr } = await supabase
    .from('sending_accounts')
    .select('*')
    .eq('id', providerAccountId)
    .maybeSingle();

  if (acctErr || !acct) {
    return NextResponse.json({ error: 'Account not found' }, { status: 400 });
  }

  // Build queue rows
  const rows = [];
  for (const lead of leads) {
    const subject = template.subject.replaceAll('{{first_name}}', lead.first_name ?? lead.name ?? '');
    const token = crypto.randomBytes(16).toString('hex');

    // Ensure unsubscribe token exists
    const { error: tokenErr } = await supabase.from('unsubscribe_tokens').upsert({
      lead_id: lead.id,
      token,
    }, { onConflict: 'lead_id' });

    if (tokenErr) {
      console.error('Error creating unsubscribe token:', tokenErr);
    }

    const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/u/${token}`;
    const pixelUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/pixel/${lead.id}.png`;

    const html = template.html
      .replaceAll('{{first_name}}', lead.first_name ?? lead.name ?? '')
      + `<div style="margin-top:24px;font-size:12px;color:#888">
           <a href="${unsubscribeUrl}">Unsubscribe</a>
         </div>
         <img src="${pixelUrl}" width="1" height="1" style="display:block" alt="" />`;

    rows.push({
      campaign_id: campaignId,
      lead_id: lead.id ?? null,
      provider_account_id: providerAccountId,
      to_email: lead.email,
      subject,
      body_html: html,
      schedule_at: startAt ? new Date(startAt).toISOString() : new Date().toISOString(),
      status: 'queued'
    });
  }

  const { error: qErr } = await supabase.from('smartsend_queue').insert(rows);
  if (qErr) {
    console.error('Error inserting into queue:', qErr);
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  // Log enqueue events
  const logRows = rows.map(r => ({
    campaign_id: campaignId,
    lead_id: r.lead_id,
    event_type: 'email_enqueued',
    details: { to: r.to_email }
  }));

  await supabase.from('smartsend_campaign_logs').insert(logRows);

  return NextResponse.json({ ok: true, count: rows.length });
}
