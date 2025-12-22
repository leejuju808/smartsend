/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for inspection scheduling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scheduleInspection } from '@/lib/scheduling-intelligence';

/**
 * POST /api/scheduling/inspection
 * Schedule inspection for a job
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
      inspection_date,
      inspection_time,
      inspection_type,
      inspector_name,
    } = body;

    if (!workspace_id || !job_id || !inspection_date || !inspection_time) {
      return NextResponse.json(
        { error: 'workspace_id, job_id, inspection_date, and inspection_time are required' },
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

    const result = await scheduleInspection(
      workspace_id,
      job_id,
      inspection_date,
      inspection_time,
      inspection_type,
      inspector_name
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to schedule inspection' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
    });
  } catch (error) {
    console.error('Error scheduling inspection:', error);
    return NextResponse.json(
      { error: 'Failed to schedule inspection' },
      { status: 500 }
    );
  }
}





















