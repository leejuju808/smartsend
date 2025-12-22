import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { parent_kind, parent_id, name, variants } = await req.json();

    if (!parent_kind || !parent_id || !name || !Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: parent_kind, parent_id, name, and variants array' },
        { status: 400 }
      );
    }

    // Verify parent ownership
    let parentTable = '';
    if (parent_kind === 'campaign') {
      parentTable = 'campaigns';
    } else if (parent_kind === 'sequence') {
      parentTable = 'sequences';
    } else {
      return NextResponse.json(
        { error: 'Invalid parent_kind. Must be "campaign" or "sequence"' },
        { status: 400 }
      );
    }

    const { data: parent, error: parentError } = await supabase
      .from(parentTable)
      .select('id, user_id')
      .eq('id', parent_id)
      .eq('user_id', user.id)
      .single();

    if (parentError || !parent) {
      return NextResponse.json(
        { error: 'Parent not found or access denied' },
        { status: 404 }
      );
    }

    // Create A/B test
    const { data: test, error: testError } = await supabase
      .from('ab_tests')
      .insert({ 
        parent_kind, 
        parent_id, 
        name,
        status: 'running'
      })
      .select()
      .single();

    if (testError) {
      console.error('Error creating A/B test:', testError);
      return NextResponse.json(
        { error: 'Failed to create A/B test' },
        { status: 500 }
      );
    }

    // Create variants
    const variantsToInsert = variants.map((variant: any, index: number) => ({
      ab_test_id: test.id,
      subject: variant.subject,
      body_text: variant.body_text || '',
      body_html: variant.body_html || '',
      traffic_split: variant.traffic_split || Math.round(100 / variants.length)
    }));

    const { data: insertedVariants, error: variantsError } = await supabase
      .from('ab_variants')
      .insert(variantsToInsert)
      .select();

    if (variantsError) {
      console.error('Error creating variants:', variantsError);
      // Clean up the test if variants fail
      await supabase.from('ab_tests').delete().eq('id', test.id);
      return NextResponse.json(
        { error: 'Failed to create variants' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      test,
      variants: insertedVariants
    });

  } catch (error) {
    console.error('Error creating A/B test:', error);
    return NextResponse.json(
      { error: 'Failed to create A/B test' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all A/B tests for campaigns and sequences owned by the user
    const { data: tests, error: testsError } = await supabase
      .from('ab_tests')
      .select(`
        *,
        ab_variants (*)
      `)
      .or(`parent_id.in.(
        select id from campaigns where user_id = '${user.id}'
        union
        select id from sequences where created_by = '${user.id}'
      )`)
      .order('created_at', { ascending: false });

    if (testsError) {
      console.error('Error fetching A/B tests:', testsError);
      return NextResponse.json(
        { error: 'Failed to fetch A/B tests' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tests: tests || []
    });

  } catch (error) {
    console.error('Error fetching A/B tests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch A/B tests' },
      { status: 500 }
    );
  }
} 