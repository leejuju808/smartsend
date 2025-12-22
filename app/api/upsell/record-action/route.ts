/**
 * Block 23720 — Record Upgrade Action API
 * 
 * Records when users interact with upgrade prompts (shown, dismissed, clicked)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, triggerType, currentPlan, suggestedPlan, eventId } = body;

    // Get workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;

    // If eventId provided, update existing event
    if (eventId) {
      const updateData: any = {};
      
      if (action === 'shown') {
        updateData.shown_at = new Date().toISOString();
      } else if (action === 'dismissed') {
        updateData.dismissed_at = new Date().toISOString();
      } else if (action === 'upgraded') {
        updateData.upgraded_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('upgrade_trigger_events')
        .update(updateData)
        .eq('id', eventId);

      if (updateError) {
        console.error('Error updating trigger event:', updateError);
      }

      return NextResponse.json({ success: true });
    }

    // Otherwise, create new event
    const { data: event, error: insertError } = await supabase
      .from('upgrade_trigger_events')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        trigger_type: triggerType,
        current_plan: currentPlan,
        suggested_plan: suggestedPlan,
        shown_at: action === 'shown' ? new Date().toISOString() : null,
        dismissed_at: action === 'dismissed' ? new Date().toISOString() : null,
        upgraded_at: action === 'upgraded' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error recording trigger event:', insertError);
      return NextResponse.json(
        { error: 'Failed to record action', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error: any) {
    console.error('Error recording upgrade action:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}






































