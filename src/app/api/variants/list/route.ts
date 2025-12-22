import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaign_id = searchParams.get('campaign_id');
    const step_index = searchParams.get('step_index') || '0';

    if (!campaign_id) {
      return NextResponse.json(
        { error: 'campaign_id is required' },
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

    // Get variants with metrics using the RPC function
    const { data: variants, error: variantsError } = await supabase
      .rpc('get_variant_metrics', {
        p_campaign_id: campaign_id,
        p_step_index: parseInt(step_index)
      });

    if (variantsError) {
      console.error('Error fetching variants:', variantsError);
      return NextResponse.json(
        { error: 'Failed to fetch variants' },
        { status: 500 }
      );
    }

    // Get variant details
    const { data: variantDetails, error: detailsError } = await supabase
      .from('campaign_variants')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('step_index', parseInt(step_index))
      .order('name');

    if (detailsError) {
      console.error('Error fetching variant details:', detailsError);
      return NextResponse.json(
        { error: 'Failed to fetch variant details' },
        { status: 500 }
      );
    }

    // Merge metrics with details
    const enrichedVariants = variantDetails.map(detail => {
      const metrics = variants.find((v: any) => v.variant_id === detail.id);
      return {
        ...detail,
        metrics: metrics ? {
          impressions: metrics.impressions,
          opens: metrics.opens,
          clicks: metrics.clicks,
          replies: metrics.replies,
          open_rate: metrics.open_rate,
          click_rate: metrics.click_rate,
          reply_rate: metrics.reply_rate
        } : {
          impressions: 0,
          opens: 0,
          clicks: 0,
          replies: 0,
          open_rate: 0,
          click_rate: 0,
          reply_rate: 0
        }
      };
    });

    return NextResponse.json({
      success: true,
      variants: enrichedVariants,
      step_index: parseInt(step_index)
    });

  } catch (error) {
    console.error('Error listing variants:', error);
    return NextResponse.json(
      { error: 'Failed to list variants' },
      { status: 500 }
    );
  }
} 