/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for multi-crew smart calendar
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMultiCrewCalendar } from '@/lib/scheduling-intelligence';

/**
 * GET /api/scheduling/calendar
 * Get multi-crew calendar view
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspace_id');
    const startDate = searchParams.get('start_date') || new Date().toISOString();
    const endDate = searchParams.get('end_date') || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    const events = await getMultiCrewCalendar(workspaceId, startDate, endDate);

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching calendar:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduling/calendar
 * Create or update calendar event
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
      job_id,
      crew_id,
      event_type,
      title,
      description,
      start_time,
      end_time,
      material_delivery_id,
      inspection_id,
    } = body;

    if (!workspace_id || !event_type || !title || !start_time) {
      return NextResponse.json(
        { error: 'workspace_id, event_type, title, and start_time are required' },
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

    // Create or update event
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .upsert({
        id: body.id, // If updating existing event
        workspace_id,
        job_id,
        crew_id,
        event_type,
        title,
        description,
        start_time,
        end_time,
        material_delivery_id,
        inspection_id,
        event_status: 'scheduled',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (eventError) {
      console.error('Error creating/updating event:', eventError);
      return NextResponse.json(
        { error: eventError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}





















