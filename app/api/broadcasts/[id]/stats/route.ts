import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// GET /api/broadcasts/[id]/stats - Get detailed broadcast statistics
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get broadcast stats
    const { data: stats, error: statsError } = await supabase
      .from('v_broadcast_stats')
      .select('*')
      .eq('broadcast_id', params.id)
      .single();

    if (statsError || !stats) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    // Get stats by inbox
    const { data: inboxStats } = await supabase
      .from('v_broadcast_stats_by_inbox')
      .select('*')
      .eq('broadcast_id', params.id);

    // Get recipient details (sample for charts)
    const { data: recipients } = await supabase
      .from('broadcast_recipients')
      .select('sent_at, delivered_at, opened_at, clicked_at, replied_at, bounced_at, spam_at')
      .eq('broadcast_id', params.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true })
      .limit(1000);

    // Calculate time-series data
    const sendsOverTime = calculateTimeSeries(recipients || [], 'sent_at');
    const opensOverTime = calculateTimeSeries(recipients || [], 'opened_at');
    const clicksOverTime = calculateTimeSeries(recipients || [], 'clicked_at');
    const repliesOverTime = calculateTimeSeries(recipients || [], 'replied_at');
    const bouncesOverTime = calculateTimeSeries(recipients || [], 'bounced_at');

    return NextResponse.json({
      overview: {
        sent: stats.sent_count || 0,
        delivered: stats.delivered_count || 0,
        delivery_rate: stats.delivery_rate || 0,
        open_rate: stats.open_rate || 0,
        click_rate: stats.click_rate || 0,
        reply_rate: stats.reply_rate || 0,
        bounces: stats.bounced_count || 0,
        spam: stats.spam_count || 0,
        unsubscribes: stats.unsubscribe_count || 0,
      },
      by_inbox: inboxStats || [],
      time_series: {
        sends: sendsOverTime,
        opens: opensOverTime,
        clicks: clicksOverTime,
        replies: repliesOverTime,
        bounces: bouncesOverTime,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/broadcasts/[id]/stats:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

function calculateTimeSeries(data: any[], field: string): Array<{ date: string; count: number }> {
  const timeMap = new Map<string, number>();

  for (const item of data) {
    const timestamp = item[field];
    if (!timestamp) continue;

    const date = new Date(timestamp).toISOString().split('T')[0];
    timeMap.set(date, (timeMap.get(date) || 0) + 1);
  }

  return Array.from(timeMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}



