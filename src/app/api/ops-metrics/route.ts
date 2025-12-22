import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();

    // Get open support tickets count
    const { count: openTickets } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    // Get tickets by priority
    const { count: urgentTickets } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('priority', 'urgent')
      .in('status', ['open', 'triaged', 'in_progress']);

    // Get upcoming renewals (next 7 days)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString();
    const { count: dueRenewals } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .lte('current_period_end', sevenDaysFromNow)
      .gt('current_period_end', new Date().toISOString());

    // Get active orgs count (workspaces with active subscriptions)
    const { count: activeOrgs } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Calculate retention rate (orgs active in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count: activeLast30Days } = await supabase
      .from('channel_messages')
      .select('org_id', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', thirtyDaysAgo);

    // Total orgs
    const { count: totalOrgs } = await supabase
      .from('workspaces')
      .select('*', { count: 'exact', head: true });

    const retention = totalOrgs && totalOrgs > 0
      ? Math.round((activeLast30Days || 0) / totalOrgs * 100)
      : 0;

    // Get triaged tickets today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: triagedToday } = await supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'triaged')
      .gte('updated_at', todayStart.toISOString());

    // Average response time (tickets resolved today)
    const { data: resolvedToday } = await supabase
      .from('support_tickets')
      .select('created_at, updated_at')
      .eq('status', 'resolved')
      .gte('updated_at', todayStart.toISOString());

    let avgResponseTime = 0;
    if (resolvedToday && resolvedToday.length > 0) {
      const times = resolvedToday.map(t => {
        const created = new Date(t.created_at).getTime();
        const resolved = new Date(t.updated_at).getTime();
        return (resolved - created) / (1000 * 60); // minutes
      });
      avgResponseTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }

    return NextResponse.json({
      open_tickets: openTickets || 0,
      urgent_tickets: urgentTickets || 0,
      due_renewals: dueRenewals || 0,
      active_orgs: activeOrgs || 0,
      retention: retention,
      triaged_today: triagedToday || 0,
      avg_response_time_minutes: avgResponseTime,
    });
  } catch (error) {
    console.error('Error fetching ops metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ops metrics' },
      { status: 500 }
    );
  }
}

