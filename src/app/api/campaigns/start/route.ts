import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { id: campaign_id } = body;
    
    if (!campaign_id) {
      return NextResponse.json(
        { error: 'Missing campaign id' },
        { status: 400 }
      );
    }

    // Check campaign exists and verify ownership
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Enforce plan limits: get owner user_id for this campaign
    const { data: ownerData } = await supabase.rpc("get_campaign_owner", { p_campaign_id: campaign_id });
    if (!ownerData) {
      return NextResponse.json(
        { error: 'Could not determine campaign owner' },
        { status: 500 }
      );
    }
    const ownerUserId = ownerData as string;

    // get usage + plan status
    const { data: usage } = await supabase.rpc("get_user_usage", { p_user: ownerUserId });
    if (usage && usage.status !== 'active' && usage.status !== 'trialing') {
      return NextResponse.json(
        { ok: false, error: "Activate a plan to start sending." }, 
        { status: 402 }
      );
    }

    // Call enqueueCampaign edge function
    const enqueueResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enqueueCampaign`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ campaign_id })
      }
    );

    if (!enqueueResponse.ok) {
      const errorText = await enqueueResponse.text();
      return NextResponse.json(
        { error: `Failed to enqueue campaign: ${errorText}` },
        { status: enqueueResponse.status }
      );
    }

    // Set status to Running
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'Running',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign_id);

    if (updateError) {
      console.error('Error updating campaign status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update campaign status' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Campaign start error:', error);
    return NextResponse.json(
      { error: 'Failed to start campaign' },
      { status: 500 }
    );
  }
} 