import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as { enabled?: boolean; start?: boolean; daily_cap?: number };
    const patch: any = {};

    if (typeof body.enabled === 'boolean') patch.warmup_enabled = body.enabled;
    if (body.start) patch.warmup_started_at = new Date().toISOString().slice(0, 10);
    if (typeof body.daily_cap === 'number') patch.daily_cap = Math.max(10, Math.min(200, Math.floor(body.daily_cap)));

    const { error } = await supabase
      .from('connected_accounts')
      .update(patch)
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error updating warmup settings:', error);
    return NextResponse.json({ error: 'Failed to update warmup settings' }, { status: 500 });
  }
}

