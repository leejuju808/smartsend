import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { campaign_id, step_index, variants } = body;

    if (!campaign_id || !Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id and variants array' },
        { status: 400 }
      );
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, user_id')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found or access denied' },
        { status: 404 }
      );
    }

    // Validate variants
    for (const variant of variants) {
      if (!variant.name || !variant.subject || !variant.body_html) {
        return NextResponse.json(
          { error: 'Each variant must have name, subject, and body_html' },
          { status: 400 }
        );
      }
    }

    // Delete existing variants for this campaign step
    const { error: deleteError } = await supabase
      .from('campaign_variants')
      .delete()
      .eq('campaign_id', campaign_id)
      .eq('step_index', step_index || 0);

    if (deleteError) {
      console.error('Error deleting existing variants:', deleteError);
      return NextResponse.json(
        { error: 'Failed to update variants' },
        { status: 500 }
      );
    }

    // Insert new variants
    const variantsToInsert = variants.map((variant, index) => ({
      campaign_id,
      step_index: step_index || 0,
      name: variant.name,
      subject: variant.subject,
      body_html: variant.body_html,
      body_text: variant.body_text || '',
      objective: variant.objective || 'reply',
      min_impressions: variant.min_impressions || 100,
      is_winner: index === 0, // First variant is default winner
      is_paused: false
    }));

    const { data: insertedVariants, error: insertError } = await supabase
      .from('campaign_variants')
      .insert(variantsToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting variants:', insertError);
      return NextResponse.json(
        { error: 'Failed to create variants' },
        { status: 500 }
      );
    }

    // Initialize metrics for each variant
    const metricsToInsert = insertedVariants.map(variant => ({
      variant_id: variant.id,
      campaign_id,
      step_index: step_index || 0,
      impressions: 0,
      opens: 0,
      clicks: 0,
      replies: 0
    }));

    const { error: metricsError } = await supabase
      .from('variant_metrics')
      .insert(metricsToInsert);

    if (metricsError) {
      console.error('Error initializing variant metrics:', metricsError);
      // Don't fail the request if metrics init fails
    }

    return NextResponse.json({
      success: true,
      message: `Created ${variants.length} variants for campaign step ${step_index || 0}`,
      variants: insertedVariants
    });

  } catch (error) {
    console.error('Error upserting variants:', error);
    return NextResponse.json(
      { error: 'Failed to update variants' },
      { status: 500 }
    );
  }
} 