import { NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  _req: any,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const testId = params.id;

    // Get A/B test and verify ownership
    const { data: test, error: testError } = await supabase
      .from('ab_tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (testError || !test) {
      return NextResponse.json(
        { error: 'A/B test not found' },
        { status: 404 }
      );
    }

    // Verify ownership through parent
    let parentTable = '';
    let parentIdField = '';
    if (test.parent_kind === 'campaign') {
      parentTable = 'campaigns';
      parentIdField = 'user_id';
    } else if (test.parent_kind === 'sequence') {
      parentTable = 'sequences';
      parentIdField = 'created_by';
    }

    const { data: parent, error: parentError } = await supabase
      .from(parentTable)
      .select('id')
      .eq('id', test.parent_id)
      .eq(parentIdField, user.id)
      .single();

    if (parentError || !parent) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get variants for this test
    const { data: variants, error: variantsError } = await supabase
      .from('ab_variants')
      .select('*')
      .eq('ab_test_id', testId);

    if (variantsError) {
      console.error('Error fetching variants:', variantsError);
      return NextResponse.json(
        { error: 'Failed to fetch variants' },
        { status: 500 }
      );
    }

    // Calculate metrics for each variant
    const results = await Promise.all(
      (variants || []).map(async (variant) => {
        // Get sent count (impressions)
        const { count: sent } = await supabase
          .from('variant_metrics')
          .select('impressions', { count: 'exact', head: true })
          .eq('variant_id', variant.id);

        // Get opens count
        const { count: opens } = await supabase
          .from('variant_metrics')
          .select('opens', { count: 'exact', head: true })
          .eq('variant_id', variant.id);

        // Get clicks count
        const { count: clicks } = await supabase
          .from('variant_metrics')
          .select('clicks', { count: 'exact', head: true })
          .eq('variant_id', variant.id);

        // Get replies count
        const { count: replies } = await supabase
          .from('variant_metrics')
          .select('replies', { count: 'exact', head: true })
          .eq('variant_id', variant.id);

        const sentCount = sent || 0;
        const opensCount = opens || 0;
        const clicksCount = clicks || 0;
        const repliesCount = replies || 0;

        return {
          variant,
          sent: sentCount,
          opens: opensCount,
          clicks: clicksCount,
          replies: repliesCount,
          open_rate: sentCount > 0 ? Math.round((opensCount / sentCount) * 100) : 0,
          click_rate: sentCount > 0 ? Math.round((clicksCount / sentCount) * 100) : 0,
          reply_rate: sentCount > 0 ? Math.round((repliesCount / sentCount) * 100) : 0
        };
      })
    );

    return NextResponse.json({
      success: true,
      test,
      results
    });

  } catch (error) {
    console.error('Error fetching A/B test results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch results' },
      { status: 500 }
    );
  }
} 