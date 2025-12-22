import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 30-day series
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: series, error } = await supabase
      .from('v_mailbox_health')
      .select('day, sent, deliver_pct, reply_pct, bounce_pct, open_rate_pct, click_rate_pct')
      .eq('mailbox_id', params.id)
      .gte('day', since)
      .order('day', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Today summary
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = series?.find(r => r.day === today);

    // Warmup settings
    const { data: mb } = await supabase
      .from('connected_accounts')
      .select('daily_cap,warmup_enabled,warmup_day,warmup_started_at,warmup_plan_id,provider_domain')
      .eq('id', params.id)
      .single();

    // Verify ownership via RLS
    if (!mb) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    return NextResponse.json({
      summary: {
        sent_today: todayRow?.sent ?? 0,
        deliver_pct_today: todayRow?.deliver_pct ?? 0,
        reply_pct_today: todayRow?.reply_pct ?? 0,
        bounce_pct_today: todayRow?.bounce_pct ?? 0
      },
      series: series || [],
      warmup: {
        enabled: mb?.warmup_enabled ?? false,
        started_at: mb?.warmup_started_at ?? null,
        day: mb?.warmup_day ?? null,
        daily_cap: mb?.daily_cap ?? 40,
        provider_domain: mb?.provider_domain ?? null,
        plan_id: mb?.warmup_plan_id ?? null
      }
    });
  } catch (error) {
    console.error('Error fetching mailbox health:', error);
    return NextResponse.json({ error: 'Failed to fetch health data' }, { status: 500 });
  }
}

