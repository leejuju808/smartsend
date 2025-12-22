import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  try {
    // Find the unsubscribe token
    const { data: row, error: tokenErr } = await supabase
      .from('unsubscribe_tokens')
      .select('lead_id')
      .eq('token', token)
      .maybeSingle();

    if (tokenErr || !row) {
      return NextResponse.json(
        { error: 'Invalid unsubscribe link' },
        { status: 404 }
      );
    }

    // Mark lead as unsubscribed
    const { error: updateErr } = await supabase
      .from('leads')
      .update({ unsubscribed: true })
      .eq('id', row.lead_id);

    if (updateErr) {
      console.error('Error updating lead:', updateErr);
      // Continue anyway
    }

    // Log the unsubscribe event
    await supabase.from('smartsend_campaign_logs').insert({
      campaign_id: null,
      lead_id: row.lead_id,
      event_type: 'unsubscribe',
      details: {}
    });

    return new NextResponse(
      `<html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 100px auto; padding: 40px; text-align: center;">
          <h2 style="color: #059669; margin-bottom: 16px;">✓ You're Unsubscribed</h2>
          <p style="color: #666; margin-top: 0;">You won't receive more emails from us.</p>
          <p style="color: #999; font-size: 14px; margin-top: 32px;">If you have any questions, feel free to contact us.</p>
        </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  } catch (e) {
    console.error('Error processing unsubscribe:', e);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
