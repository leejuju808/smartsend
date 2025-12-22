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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url); 
    const token = url.searchParams.get('token') || '';
    
    if (!token) {
      return NextResponse.json({ error: 'missing token' }, { status: 400 });
    }

    const sb = sbAdmin();
    const { data, error } = await sb
      .from('unsubscribe_tokens')
      .select('workspace_id, email, sequence_id, created_at')
      .eq('token', token)
      .limit(1);

    if (error) {
      console.error('Database error resolving token:', error);
      return NextResponse.json({ error: 'database error' }, { status: 500 });
    }

    if (!data || !data.length) {
      return NextResponse.json({ error: 'invalid token' }, { status: 404 });
    }

    const row = data[0];
    
    // Optional expiration (e.g., 90 days)
    const tokenAge = Date.now() - new Date(row.created_at).getTime();
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (tokenAge > maxAge) {
      return NextResponse.json({ error: 'expired token' }, { status: 410 });
    }

    const email = String(row.email);
    const [name, domain] = email.split('@');
    const email_masked = name.slice(0, 1) + '***@' + domain;

    // Check current preferences
    await sb.rpc('app.set_workspace', { id: row.workspace_id });
    
    const { data: prefsData } = await sb
      .from('email_preferences')
      .select('global_opt_out')
      .eq('workspace_id', row.workspace_id)
      .eq('email', email)
      .maybeSingle();

    const { data: seqOptOutData } = await sb
      .from('sequence_opt_outs')
      .select('sequence_id')
      .eq('workspace_id', row.workspace_id)
      .eq('email', email)
      .eq('sequence_id', row.sequence_id)
      .maybeSingle();

    return NextResponse.json({ 
      ok: true, 
      email_masked, 
      email, 
      sequence_id: row.sequence_id, 
      workspace_id: row.workspace_id,
      global_opt_out: prefsData?.global_opt_out || false,
      sequence_opt_out: seqOptOutData ? true : false
    });

  } catch (error) {
    console.error('Error resolving unsubscribe token:', error);
    return NextResponse.json({ error: 'internal server error' }, { status: 500 });
  }
} 