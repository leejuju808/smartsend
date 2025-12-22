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
    const { campaign_id, step_index, variant_id, action } = body;

    if (!campaign_id || !variant_id || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id, variant_id, and action' },
        { status: 400 }
      );
    }

    if (!['declare_winner', 'pause', 'resume'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be declare_winner, pause, or resume' },
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

    // Verify variant exists and belongs to this campaign
    const { data: variant, error: variantError } = await supabase
      .from('campaign_variants')
      .select('id, name, step_index')
      .eq('id', variant_id)
      .eq('campaign_id', campaign_id)
      .eq('step_index', step_index || 0)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        { error: 'Variant not found or access denied' },
        { status: 404 }
      );
    }

    if (action === 'declare_winner') {
      // Mark this variant as winner and pause others
      const { error: updateError } = await supabase
        .from('campaign_variants')
        .update({ 
          is_winner: true, 
          is_paused: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', variant_id);

      if (updateError) {
        console.error('Error updating winner variant:', updateError);
        return NextResponse.json(
          { error: 'Failed to declare winner' },
          { status: 500 }
        );
      }

      // Pause other variants for this campaign step
      const { error: pauseError } = await supabase
        .from('campaign_variants')
        .update({ 
          is_winner: false, 
          is_paused: true,
          updated_at: new Date().toISOString()
        })
        .eq('campaign_id', campaign_id)
        .eq('step_index', step_index || 0)
        .neq('id', variant_id);

      if (pauseError) {
        console.error('Error pausing other variants:', pauseError);
        // Don't fail the request if this fails
      }

      return NextResponse.json({
        success: true,
        message: `Declared "${variant.name}" as winner for step ${step_index || 0}`,
        variant_id,
        action: 'winner_declared'
      });

    } else if (action === 'pause') {
      // Pause this variant
      const { error: updateError } = await supabase
        .from('campaign_variants')
        .update({ 
          is_paused: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', variant_id);

      if (updateError) {
        console.error('Error pausing variant:', updateError);
        return NextResponse.json(
          { error: 'Failed to pause variant' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Paused variant "${variant.name}"`,
        variant_id,
        action: 'paused'
      });

    } else if (action === 'resume') {
      // Resume this variant
      const { error: updateError } = await supabase
        .from('campaign_variants')
        .update({ 
          is_paused: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', variant_id);

      if (updateError) {
        console.error('Error resuming variant:', updateError);
        return NextResponse.json(
          { error: 'Failed to resume variant' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Resumed variant "${variant.name}"`,
        variant_id,
        action: 'resumed'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error managing variant winner:', error);
    return NextResponse.json(
      { error: 'Failed to manage variant' },
      { status: 500 }
    );
  }
} 