/**
 * Block 24860 — SmartSend Roofing Alerts & Automations v1
 * 
 * GET /api/roofing-alerts/missing-steps
 * Gets missing steps detected for jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserAndWorkspace } from "@/src/lib/api-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const { searchParams } = new URL(req.url);

    const job_id = searchParams.get('job_id');
    const status = searchParams.get('status') || 'detected';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Build query
    let query = supabase
      .from('missing_steps')
      .select(`
        *,
        job:roofing_jobs(id, title, status, job_value),
        alert:roofing_alerts(id, title, message, priority)
      `)
      .eq('workspace_id', workspaceId)
      .order('detected_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (job_id) {
      query = query.eq('job_id', job_id);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: missingSteps, error } = await query;

    if (error) {
      console.error('Error fetching missing steps:', error);
      return NextResponse.json(
        { error: 'Failed to fetch missing steps', details: error.message },
        { status: 500 }
      );
    }

    // Get summary
    const { data: allSteps } = await supabase
      .from('missing_steps')
      .select('status, step_type')
      .eq('workspace_id', workspaceId);

    const summary = {
      total: missingSteps?.length || 0,
      detected: allSteps?.filter(s => s.status === 'detected').length || 0,
      in_progress: allSteps?.filter(s => s.status === 'in_progress').length || 0,
      completed: allSteps?.filter(s => s.status === 'completed').length || 0,
      by_type: {
        contract_upload: allSteps?.filter(s => s.step_type === 'contract_upload').length || 0,
        deposit_collection: allSteps?.filter(s => s.step_type === 'deposit_collection').length || 0,
        completion_photos: allSteps?.filter(s => s.step_type === 'completion_photos').length || 0,
        supplement_submission: allSteps?.filter(s => s.step_type === 'supplement_submission').length || 0,
        review_request: allSteps?.filter(s => s.step_type === 'review_request').length || 0,
      },
    };

    return NextResponse.json({
      missing_steps: missingSteps || [],
      summary,
    });
  } catch (error: any) {
    console.error('Error in GET /api/roofing-alerts/missing-steps:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, workspaceId, supabase } = await getUserAndWorkspace();
    const body = await req.json();
    const action = body.action;

    if (action === 'scan') {
      // Trigger missing steps scan
      const { data: steps, error } = await supabase.rpc('detect_missing_steps', {
        p_workspace_id: workspaceId,
      });

      if (error) {
        console.error('Error scanning missing steps:', error);
        return NextResponse.json(
          { error: 'Failed to scan missing steps', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        steps_detected: steps?.length || 0,
        steps: steps || [],
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/roofing-alerts/missing-steps:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






































