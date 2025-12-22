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
    const { campaign_id, steps } = body;

    if (!campaign_id || !Array.isArray(steps)) {
      return NextResponse.json(
        { error: 'Missing required fields: campaign_id and steps array' },
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

    // Start transaction
    const { error: transactionError } = await supabase.rpc('begin_transaction');
    if (transactionError) {
      console.error('Transaction start error:', transactionError);
      return NextResponse.json({ error: 'Failed to start transaction' }, { status: 500 });
    }

    try {
      // Delete existing steps for this campaign
      const { error: deleteError } = await supabase
        .from('campaign_steps')
        .delete()
        .eq('campaign_id', campaign_id);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new steps
      const stepsToInsert = steps.map((step: any, index: number) => ({
        campaign_id,
        step_index: index,
        subject: step.subject,
        body_html: step.body_html,
        delay_days: step.delay_days || 0
      }));

      const { error: insertError } = await supabase
        .from('campaign_steps')
        .insert(stepsToInsert);

      if (insertError) {
        throw insertError;
      }

      // Update campaign to mark as sequence
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ 
          is_sequence: true,
          current_step: 0,
          last_sent_step: -1,
          updated_at: new Date().toISOString()
        })
        .eq('id', campaign_id);

      if (updateError) {
        throw updateError;
      }

      // Commit transaction
      const { error: commitError } = await supabase.rpc('commit_transaction');
      if (commitError) {
        throw commitError;
      }

      return NextResponse.json({ 
        success: true, 
        message: `Campaign updated with ${steps.length} steps`,
        steps: stepsToInsert
      });

    } catch (error) {
      // Rollback on error
      await supabase.rpc('rollback_transaction');
      throw error;
    }

  } catch (error) {
    console.error('Error upserting campaign steps:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign steps' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  // PUT is same as POST for upsert
  return POST(request);
} 