/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for automatic event rescheduling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { autoRescheduleEvent } from '@/lib/scheduling-intelligence';

/**
 * POST /api/scheduling/reschedule
 * Auto-reschedule an event
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      event_id,
      reason,
      new_start_time,
      new_crew_id,
      notify_customer = true,
      update_materials = true,
    } = body;

    if (!workspace_id || !event_id || !reason) {
      return NextResponse.json(
        { error: 'workspace_id, event_id, and reason are required' },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    const result = await autoRescheduleEvent(workspace_id, {
      eventId: event_id,
      reason,
      newStartTime: new_start_time,
      newCrewId: new_crew_id,
      notifyCustomer: notify_customer,
      updateMaterials: update_materials,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to reschedule event' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      newEventId: result.newEventId,
    });
  } catch (error) {
    console.error('Error rescheduling event:', error);
    return NextResponse.json(
      { error: 'Failed to reschedule event' },
      { status: 500 }
    );
  }
}





















