import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabaseServer';

/**
 * Cron job to reset monthly email counters
 * Should be called daily to reset daily usage and monthly on period boundaries
 * 
 * This endpoint should be protected with a cron secret
 */
export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const supabase = createSupabaseServer();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    // 1. Reset daily usage for yesterday (cleanup old records)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Note: Daily usage is automatically managed per day, but we can clean up old records
    // The daily cap resets automatically each day when checking

    // 2. Reset monthly email counters for orgs whose billing period has ended
    // Get all orgs with billing periods that have ended
    const { data: orgsToReset, error: orgsError } = await supabase
      .from('organizations')
      .select('id, period_renews_at, emails_sent_this_period')
      .not('period_renews_at', 'is', null)
      .lt('period_renews_at', now.toISOString());

    if (orgsError) {
      console.error('Error fetching orgs to reset:', orgsError);
      return NextResponse.json(
        { error: 'Failed to fetch orgs', details: orgsError.message },
        { status: 500 }
      );
    }

    let resetCount = 0;

    if (orgsToReset && orgsToReset.length > 0) {
      // Reset emails_sent_this_period for orgs whose period has ended
      const orgIds = orgsToReset.map(org => org.id);

      const { error: resetError } = await supabase
        .from('organizations')
        .update({ emails_sent_this_period: 0 })
        .in('id', orgIds);

      if (resetError) {
        console.error('Error resetting email counters:', resetError);
        return NextResponse.json(
          { error: 'Failed to reset counters', details: resetError.message },
          { status: 500 }
        );
      }

      resetCount = orgIds.length;
    }

    // 3. Also reset orgs without period_renews_at (calendar month reset)
    // Reset on the 1st of each month
    if (now.getDate() === 1) {
      const { data: orgsWithoutPeriod, error: noPeriodError } = await supabase
        .from('organizations')
        .select('id')
        .is('period_renews_at', null)
        .gt('emails_sent_this_period', 0);

      if (!noPeriodError && orgsWithoutPeriod && orgsWithoutPeriod.length > 0) {
        const orgIdsWithoutPeriod = orgsWithoutPeriod.map(org => org.id);

        const { error: calendarResetError } = await supabase
          .from('organizations')
          .update({ emails_sent_this_period: 0 })
          .in('id', orgIdsWithoutPeriod);

        if (calendarResetError) {
          console.error('Error resetting calendar month counters:', calendarResetError);
        } else {
          resetCount += orgIdsWithoutPeriod.length;
        }
      }
    }

    // 4. Recalculate campaign_count for all orgs
    const { data: allOrgs } = await supabase
      .from('organizations')
      .select('id');

    if (allOrgs) {
      for (const org of allOrgs) {
        // Count active campaigns for this org
        const { count } = await supabase
          .from('campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', org.id)
          .in('status', ['active', 'running', 'scheduled']);

        await supabase
          .from('organizations')
          .update({ campaign_count: count || 0 })
          .eq('id', org.id);
      }
    }

    return NextResponse.json({
      success: true,
      resetCount,
      timestamp: now.toISOString(),
      message: `Reset ${resetCount} organization(s) email counters`,
    });
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}




























































