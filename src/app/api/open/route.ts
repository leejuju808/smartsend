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

// 1x1 transparent PNG (base64)
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8z8DwHwAF+QL9lU8TkgAAAABJRU5ErkJggg==')
  .split('')
  .map(c => c.charCodeAt(0))
);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const t = url.searchParams.get('t');
    if (!t) {
      return new NextResponse(PNG, { 
        headers: { 
          'Content-Type': 'image/png', 
          'Cache-Control': 'no-store' 
        } 
      });
    }

    const sb = sbAdmin();
    // Resolve token to workspace and metadata
    const { data: ot } = await sb.from('open_tokens').select('workspace_id, email, subscriber_id, sequence_id').eq('token', t).limit(1);
    if (ot && ot.length) {
      const row = ot[0];
      await sb.rpc('app.set_workspace', { id: row.workspace_id });
      await sb.from('open_events').insert({
        workspace_id: row.workspace_id,
        token: t,
        email: row.email,
        subscriber_id: row.subscriber_id,
        sequence_id: row.sequence_id,
        user_agent: req.headers.get('user-agent') || '',
        ip: (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || null,
      });
    }
  } catch (error) {
    console.error('Error logging open event:', error);
  }

  return new NextResponse(PNG, { 
    headers: { 
      'Content-Type': 'image/png', 
      'Cache-Control': 'no-store' 
    } 
  });
} 