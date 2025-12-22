/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for material delivery scheduling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scheduleMaterialDelivery, autoScheduleMaterialDelivery } from '@/lib/scheduling-intelligence';

/**
 * POST /api/scheduling/material-delivery
 * Schedule material delivery for a job
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
      material_delivery_id,
      delivery_date,
      delivery_window_start,
      delivery_window_end,
      auto_schedule = false,
    } = body;

    if (!workspace_id || !job_id) {
      return NextResponse.json(
        { error: 'workspace_id and job_id are required' },
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

    // Auto-schedule if requested
    if (auto_schedule) {
      // Get job start time
      const { data: job } = await supabase
        .from('roofing_jobs')
        .select('scheduled_start_date')
        .eq('id', job_id)
        .single();

      if (!job?.scheduled_start_date) {
        return NextResponse.json(
          { error: 'Job must have a scheduled start date for auto-scheduling' },
          { status: 400 }
        );
      }

      const result = await autoScheduleMaterialDelivery(
        workspace_id,
        job_id,
        job.scheduled_start_date
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to auto-schedule material delivery' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, autoScheduled: true });
    }

    // Manual scheduling
    if (!material_delivery_id || !delivery_date) {
      return NextResponse.json(
        { error: 'material_delivery_id and delivery_date are required for manual scheduling' },
        { status: 400 }
      );
    }

    const result = await scheduleMaterialDelivery(
      workspace_id,
      job_id,
      material_delivery_id,
      delivery_date,
      delivery_window_start,
      delivery_window_end
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to schedule material delivery' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
    });
  } catch (error) {
    console.error('Error scheduling material delivery:', error);
    return NextResponse.json(
      { error: 'Failed to schedule material delivery' },
      { status: 500 }
    );
  }
}





















