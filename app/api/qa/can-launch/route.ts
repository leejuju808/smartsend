import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/qa/can-launch
 * Check if account can launch (all critical checks passed)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('account_id') || user.id;

    // Check using database function
    const { data, error } = await supabase.rpc('can_account_launch', {
      p_account_id: accountId,
    });

    if (error) {
      console.error('Error checking launch status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get latest run details
    const { data: latestRun } = await supabase
      .from('qa_check_runs')
      .select('*')
      .eq('account_id', accountId)
      .eq('run_type', 'full')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      canLaunch: data === true,
      latestRun: latestRun || null,
    });
  } catch (error: any) {
    console.error('Error in GET /api/qa/can-launch:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
























































