/**
 * Block 256200: Restock Alerts API
 * GET /api/yard/alerts/restock - Get restock alerts for a company
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
    const priority = searchParams.get('priority');

    if (!company_id) {
      return NextResponse.json(
        { error: 'company_id is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('yard_restock_alerts')
      .select(`
        *,
        yard_items:yard_item_id (
          id,
          material_name,
          material_category,
          unit,
          brand,
          color
        )
      `)
      .eq('company_id', company_id)
      .eq('status', status);

    if (priority) {
      query = query.eq('priority', priority);
    }

    query = query.order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    const { data: alerts, error } = await query;

    if (error) {
      console.error('Error fetching restock alerts:', error);
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
    console.error('Error in restock alerts API:', error);
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
    const { alert_id, status, acknowledged } = body;

    if (!alert_id) {
      return NextResponse.json(
        { error: 'alert_id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'acknowledged' || status === 'resolved') {
        updateData.acknowledged_by = user.id;
        updateData.acknowledged_at = new Date().toISOString();
      }
      if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      }
    }

    const { data: alert, error } = await supabase
      .from('yard_restock_alerts')
      .update(updateData)
      .eq('id', alert_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating restock alert:', error);
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
    console.error('Error updating restock alert:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















