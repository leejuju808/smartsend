import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get campaign_id from query params
    const { searchParams } = new URL(request.url);
    const campaign_id = searchParams.get('campaign_id');

    if (!campaign_id) {
      return NextResponse.json(
        { error: 'Missing campaign_id parameter' },
        { status: 400 }
      );
    }

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, user_id, is_sequence')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found or access denied' }, { status: 404 });
    }

    // Get campaign steps
    const { data: steps, error: stepsError } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', campaign_id)
      .order('step_index', { ascending: true });

    if (stepsError) {
      console.error('Error fetching campaign steps:', stepsError);
      return NextResponse.json(
        { error: 'Failed to fetch campaign steps' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      campaign: {
        id: campaign.id,
        is_sequence: campaign.is_sequence
      },
      steps: steps || []
    });

  } catch (error) {
    console.error('Error listing campaign steps:', error);
    return NextResponse.json(
      { error: 'Failed to list campaign steps' },
      { status: 500 }
    );
  }
} 