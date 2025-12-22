import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/qa/checks
 * List all QA checks (master checklist)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('qa_checks')
      .select('*')
      .order('check_code', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching QA checks:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ checks: data || [] });
  } catch (error: any) {
    console.error('Error in GET /api/qa/checks:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/qa/checks
 * Run QA checks (full, category, or single check)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { runType = 'full', category, checkId, accountId } = body;

    // Get account ID (use provided or current user's account)
    const targetAccountId = accountId || user.id;

    // Import check functions
    const { runQAChecks } = await import('@/lib/qa/checkRunner');

    // Run the checks
    const result = await runQAChecks({
      supabase,
      userId: user.id,
      accountId: targetAccountId,
      runType,
      category,
      checkId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in POST /api/qa/checks:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
























































