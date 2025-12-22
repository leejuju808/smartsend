import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { pullGmailSinceISO } from '@/app/lib/providers/gmailPull';
import { pullOutlookSinceISO } from '@/app/lib/providers/outlookPull';

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { since } = await req.json().catch(() => ({ since: null }));
    const sinceISO = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [g, o] = await Promise.allSettled([
      pullGmailSinceISO(sinceISO, user.id),
      pullOutlookSinceISO(sinceISO, user.id),
    ]);

    const gmail =
      g.status === 'fulfilled'
        ? g.value
        : { inserted: 0, error: (g as any).reason?.message };
    const outlook =
      o.status === 'fulfilled'
        ? o.value
        : { inserted: 0, error: (o as any).reason?.message };

    return NextResponse.json({ ok: true, gmail, outlook });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? 'Unexpected error' } },
      { status: 500 }
    );
  }
}

