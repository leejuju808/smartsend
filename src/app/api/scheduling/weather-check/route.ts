/**
 * Block 255300 — SmartSend Calendar & Scheduling Intelligence v1
 * 
 * API endpoints for weather-aware scheduling
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkWeatherRisk } from '@/lib/scheduling-intelligence';

/**
 * POST /api/scheduling/weather-check
 * Check weather risk for a scheduled event
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, event_date, location } = body;

    if (!job_id || !event_date) {
      return NextResponse.json(
        { error: 'job_id and event_date are required' },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from('roofing_jobs')
      .select('workspace_id')
      .eq('id', job_id)
      .single();

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify workspace access
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('workspace_id', job.workspace_id)
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'Workspace access denied' }, { status: 403 });
    }

    const weatherRisk = await checkWeatherRisk(job_id, event_date, location);

    // Update calendar event if it exists
    if (body.event_id) {
      await supabase
        .from('calendar_events')
        .update({
          weather_risk_score: weatherRisk.score,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.event_id);
    }

    return NextResponse.json({ weatherRisk });
  } catch (error) {
    console.error('Error checking weather:', error);
    return NextResponse.json(
      { error: 'Failed to check weather' },
      { status: 500 }
    );
  }
}





















