/**
 * Block 256200: Shrinkage Alerts API
 * GET /api/yard/alerts/shrinkage - Get shrinkage alerts for a company
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
    const company_id = searchParams.get('company_id');
    const status = searchParams.get('status') || 'active';
    const severity = searchParams.get('severity');
    const crew_id = searchParams.get('crew_id');

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('yard_shrinkage_alerts')
      .select(`
        *,
        yard_items:yard_item_id (
          id,
          material_name,
          material_category,
          unit
        ),
        jobs:job_id (
          id,
          homeowner_name,
          address
        ),
        crews:crew_id (
          id,
          name
        ),
        crew_members:crew_member_id (
          id,
          name
        )
      `)
      .eq('company_id', company_id)
      .eq('status', status);

    if (severity) {
      query = query.eq('severity', severity);
    }

    if (crew_id) {
      query = query.eq('crew_id', crew_id);
    }

    query = query.order('severity', { ascending: false })
      .order('created_at', { ascending: false });

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching shrinkage alerts:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alerts: alerts || [],
    });
  } catch (error: any) {
    console.error('Error in shrinkage alerts API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { alert_id, status, investigation_notes } = body;

    if (!alert_id) {
      return NextResponse.json(
        { error: 'alert_id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'acknowledged' || status === 'investigating') {
        updateData.acknowledged_by = user.id;
        updateData.acknowledged_at = new Date().toISOString();
      }
      if (status === 'resolved') {
        updateData.resolved_by = user.id;
        updateData.resolved_at = new Date().toISOString();
      }
    }
    if (investigation_notes !== undefined) {
      updateData.investigation_notes = investigation_notes;
    }

    const { data: alert, error } = await supabase
      .from('yard_shrinkage_alerts')
      .update(updateData)
      .eq('id', alert_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating shrinkage alert:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alert,
    });
  } catch (error: any) {
    console.error('Error updating shrinkage alert:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















