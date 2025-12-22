import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const { email, replied, message } = await req.json();
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find lead by email
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  
  if (leadErr) {
    console.error('Error finding lead:', leadErr);
  }
  
  if (!lead) {
    // Lead not found - this is ok for E2E testing
    return NextResponse.json({ ok: true, message: 'Lead not found, but that\'s ok for E2E' });
  }

  // Try to find an email_log for this lead to link the reply to
  const { data: emailLog } = await supabase
    .from('email_logs')
    .select('id')
    .eq('to_email', email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Insert a mock reply into email_replies
  const replyInsert = {
    email_log_id: emailLog?.id || null,
    provider: 'mock',
    provider_message_id: `mock-${Date.now()}`,
    from_email: email.toLowerCase(),
    to_email: 'sender@example.com', // placeholder
    subject: 'Re: Your message',
    body_text: message ?? 'Thanks, got it.',
    body_html: `<p>${message ?? 'Thanks, got it.'}</p>`,
    intent: 'interested' as const,
    confidence: 0.9,
  };

  const { error: insErr } = await supabase.from('email_replies').insert([replyInsert] as any);
  
  if (insErr) {
    console.error('Error inserting reply:', insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Also update the email_log if we found one
  if (emailLog) {
    await supabase
      .from('email_logs')
      .update({
        replied_at: new Date().toISOString(),
        reply_intent: 'interested',
        reply_confidence: 0.9,
        reply_excerpt: message?.slice(0, 280) ?? 'Thanks, got it.',
      })
      .eq('id', emailLog.id);
  }

  return NextResponse.json({ ok: true });
}

