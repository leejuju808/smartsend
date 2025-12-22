import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function sbAdmin() {
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  const sb = sbAdmin();

  // Look up link
  const { data: rows } = await sb.from('tracking_links').select('workspace_id, url, email, subscriber_id, sequence_id').eq('token', token).limit(1);
  if (!rows || !rows.length) {
    return NextResponse.redirect('https://example.com', 302);
  }

  const rec = rows[0];

  // Log click with user agent and IP
  try {
    const ua = req.headers.get('user-agent') || '';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    
    await sb.rpc('app.set_workspace', { id: rec.workspace_id });
    await sb.from('click_events').insert({
      workspace_id: rec.workspace_id,
      token,
      url: rec.url,
      email: rec.email,
      subscriber_id: rec.subscriber_id,
      sequence_id: rec.sequence_id,
      user_agent: ua,
      ip: ip || null,
    });
  } catch (error) {
    console.error('Error logging click event:', error);
  }

  return NextResponse.redirect(rec.url, 302);
} 