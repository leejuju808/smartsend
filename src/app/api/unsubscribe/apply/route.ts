import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyGlobalUnsub, applySequenceUnsub } from '@/lib/unsub/utils';

function sbAdmin() { 
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 
    { auth: { persistSession: false } }
  ); 
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { token, action } = await req.json();
    
    if (!token || !action) {
      return NextResponse.json({ error: 'token and action required' }, { status: 400 });
    }

    if (!['global', 'sequence'].includes(action)) {
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }

    const sb = sbAdmin();
    const { data, error } = await sb
      .from('unsubscribe_tokens')
      .select('workspace_id, email, sequence_id')
      .eq('token', token)
      .limit(1);

    if (error) {
      console.error('Database error looking up token:', error);
      return NextResponse.json({ error: 'database error' }, { status: 500 });
    }

    if (!data || !data.length) {
      return NextResponse.json({ error: 'invalid token' }, { status: 404 });
    }

    const row = data[0];

    // Extract user agent and IP for audit trail
    const ua = req.headers.get('user-agent') || '';
    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const ip = forwardedFor.split(',')[0]?.trim() || '';

    try {
      if (action === 'global') {
        await applyGlobalUnsub(row.workspace_id, row.email, { 
          ua, 
          ip, 
          reason: 'user-click' 
        });
      } else if (action === 'sequence' && row.sequence_id) {
        await applySequenceUnsub(row.workspace_id, row.email, row.sequence_id, { 
          ua, 
          ip, 
          reason: 'user-click' 
        });
      } else if (action === 'sequence' && !row.sequence_id) {
        return NextResponse.json({ 
          error: 'sequence unsubscribe not available for this token' 
        }, { status: 400 });
      }

      // Success - return updated preferences
      return NextResponse.json({ 
        ok: true, 
        message: `Successfully ${action === 'global' ? 'unsubscribed from all emails' : 'opted out of sequence'}` 
      });

    } catch (applyError) {
      console.error('Error applying unsubscribe:', applyError);
      return NextResponse.json({ 
        error: 'failed to apply unsubscribe action' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing unsubscribe request:', error);
    return NextResponse.json({ 
      error: 'invalid request format' 
    }, { status: 400 });
  }
} 