import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/qa/results
 * Get QA check results (latest run or specific run)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('account_id');
    const runId = searchParams.get('run_id');
    const latest = searchParams.get('latest') === 'true';

    // Get account ID (use provided or current user's account)
    const targetAccountId = accountId || user.id;

    if (runId) {
      // Get specific run with results
      const { data: run, error: runError } = await supabase
        .from('qa_check_runs')
        .select('*')
        .eq('id', runId)
        .single();

      if (runError) {
        return NextResponse.json({ error: runError.message }, { status: 500 });
      }

      // Get all checks that were part of this run
      const { data: runData } = await supabase
        .from('qa_check_runs')
        .select('category, check_id')
        .eq('id', runId)
        .single();

      let checkIds: string[] = [];
      if (runData?.check_id) {
        checkIds = [runData.check_id];
      } else if (runData?.category) {
        const { data: checks } = await supabase
          .from('qa_checks')
          .select('id')
          .eq('category', runData.category);
        checkIds = checks?.map(c => c.id) || [];
      } else {
        // Full run - get all checks
        const { data: allChecks } = await supabase
          .from('qa_checks')
          .select('id');
        checkIds = allChecks?.map(c => c.id) || [];
      }

      const { data: results, error: resultsError } = await supabase
        .from('qa_check_results')
        .select(`
          *,
          qa_checks (
            check_code,
            name,
            category,
            critical
          )
        `)
        .in('check_id', checkIds.length > 0 ? checkIds : ['00000000-0000-0000-0000-000000000000'])
        .order('checked_at', { ascending: false });

      if (resultsError) {
        return NextResponse.json({ error: resultsError.message }, { status: 500 });
      }

      return NextResponse.json({
        run,
        results: results || [],
      });
    } else if (latest) {
      // Get latest run for account
      const { data: run, error: runError } = await supabase
        .from('qa_check_runs')
        .select('*')
        .eq('account_id', targetAccountId)
        .eq('run_type', 'full')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (runError && runError.code !== 'PGRST116') {
        return NextResponse.json({ error: runError.message }, { status: 500 });
      }

      if (!run) {
        return NextResponse.json({ run: null, results: [] });
      }

      // Get results for this run - need to get check IDs from the run
      let checkIds: string[] = [];
      if (run.check_id) {
        checkIds = [run.check_id];
      } else if (run.category) {
        const { data: checks } = await supabase
          .from('qa_checks')
          .select('id')
          .eq('category', run.category);
        checkIds = checks?.map(c => c.id) || [];
      } else {
        // Full run - get all checks
        const { data: allChecks } = await supabase
          .from('qa_checks')
          .select('id');
        checkIds = allChecks?.map(c => c.id) || [];
      }

      const { data: results, error: resultsError } = await supabase
        .from('qa_check_results')
        .select(`
          *,
          qa_checks (
            check_code,
            name,
            category,
            critical
          )
        `)
        .in('check_id', checkIds.length > 0 ? checkIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('account_id', targetAccountId)
        .order('checked_at', { ascending: false });

      if (resultsError) {
        return NextResponse.json({ error: resultsError.message }, { status: 500 });
      }

      return NextResponse.json({
        run,
        results: results || [],
      });
    } else {
      // Get all runs for account
      const { data: runs, error: runsError } = await supabase
        .from('qa_check_runs')
        .select('*')
        .eq('account_id', targetAccountId)
        .order('started_at', { ascending: false })
        .limit(50);

      if (runsError) {
        return NextResponse.json({ error: runsError.message }, { status: 500 });
      }

      return NextResponse.json({ runs: runs || [] });
    }
  } catch (error: any) {
    console.error('Error in GET /api/qa/results:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

