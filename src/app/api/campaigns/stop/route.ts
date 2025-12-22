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

    // Set all send_queue state to Skipped (stop)
    await supabase
      .from('send_queue')
      .update({ 
        state: 'Skipped',
        locked_at: null,
        worker_id: null
      })
      .eq('campaign_id', campaign_id)
      .in('state', ['Queued', 'Locked']);

    // Update campaign status to Stopped
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'Stopped',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign_id);

    if (updateError) {
      console.error('Error stopping campaign:', updateError);
      return NextResponse.json(
        { error: 'Failed to stop campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Campaign stop error:', error);
    return NextResponse.json(
      { error: 'Failed to stop campaign' },
      { status: 500 }
    );
  }
}

