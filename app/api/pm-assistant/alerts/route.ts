/**
 * Block 256500 — AI Project Manager Assistant v1
 * GET /api/pm-assistant/alerts - Get alerts for PM
 * POST /api/pm-assistant/alerts - Create a new alert
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const pm_id = searchParams.get('pm_id');
    const job_id = searchParams.get('job_id');
    const status = searchParams.get('status') || 'active';
    const severity = searchParams.get('severity');
    const alert_type = searchParams.get('alert_type');

    if (!pm_id && !job_id) {
      return NextResponse.json(
        { error: 'pm_id or job_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('pm_alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (pm_id) {
      query = query.eq('pm_id', pm_id);
    }

    if (job_id) {
      query = query.eq('job_id', job_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (alert_type) {
      query = query.eq('alert_type', alert_type);
    }

    const { data: alerts, error: alertsError } = await query;

    if (alertsError) {
      console.error('Error fetching alerts:', alertsError);
      return NextResponse.json(
        { error: alertsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alerts: alerts || [],
      count: alerts?.length || 0,
    });
  } catch (error: any) {
    console.error('Error in alerts API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, pm_id, alert_type, message, severity = 'warning', metadata } = body;

    if (!job_id || !alert_type || !message) {
      return NextResponse.json(
        { error: 'job_id, alert_type, and message are required' },
        { status: 400 }
      );
    }

    // Create alert
    const { data: newAlert, error: createError } = await supabase
      .from('pm_alerts')
      .insert({
        job_id,
        pm_id: pm_id || null,
        alert_type,
        message,
        severity,
        metadata: metadata || {},
        status: 'active',
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating alert:', createError);
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alert: newAlert,
    });
  } catch (error: any) {
    console.error('Error in alert creation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















