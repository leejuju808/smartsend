/**
 * Block 23200 — Silent Forge Beta Group: Metrics Tracking
 * POST /api/silent-forge/metrics - Submit metrics
 * GET /api/silent-forge/metrics - Get metrics dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// POST: Submit daily metrics
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Get user's account
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get beta entry
    const { data: betaEntry } = await supabase
      .from('silent_forge_beta')
      .select('id')
      .eq('account_id', account.id)
      .single();

    if (!betaEntry) {
      return NextResponse.json(
        { error: 'You are not part of the Silent Forge Beta Group' },
        { status: 403 }
      );
    }

    const metricDate = body.metric_date || new Date().toISOString().split('T')[0];

    // Upsert metrics
    const { data: metrics, error } = await supabase
      .from('silent_forge_metrics')
      .upsert({
        beta_id: betaEntry.id,
        account_id: account.id,
        metric_date: metricDate,
        ...body
      }, {
        onConflict: 'beta_id,metric_date',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error submitting metrics:', error);
      return NextResponse.json(
        { error: 'Failed to submit metrics', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Metrics submitted successfully',
      metrics_id: metrics.id
    });

  } catch (error: any) {
    console.error('Error submitting Silent Forge metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// GET: Retrieve metrics dashboard
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // Get user's account
    const { data: account } = await supabase
      .from('accounts')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // Get beta entry
    const { data: betaEntry } = await supabase
      .from('silent_forge_beta')
      .select('id')
      .eq('account_id', account.id)
      .single();

    if (!betaEntry) {
      return NextResponse.json(
        { error: 'You are not part of the Silent Forge Beta Group' },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from('silent_forge_metrics')
      .select('*')
      .eq('beta_id', betaEntry.id)
      .order('metric_date', { ascending: false });

    if (startDate) {
      query = query.gte('metric_date', startDate);
    }
    if (endDate) {
      query = query.lte('metric_date', endDate);
    }

    const { data: metrics, error } = await query;

    if (error) {
      console.error('Error fetching metrics:', error);
      return NextResponse.json(
        { error: 'Failed to fetch metrics', details: error.message },
        { status: 500 }
      );
    }

    // Calculate aggregated stats across 7 buckets
    const aggregated = metrics?.reduce((acc: any, metric: any) => {
      // Bucket 1: Outreach Performance
      acc.outreach.emails_sent += metric.emails_sent || 0;
      acc.outreach.replies_received += metric.replies_received || 0;
      acc.outreach.leads_booked += metric.leads_booked_estimates || 0;
      
      // Bucket 2: Scheduling & Production
      acc.scheduling.events_created += metric.calendar_events_created || 0;
      acc.scheduling.crew_checkins += metric.crew_checkins || 0;
      
      // Bucket 3: Material Orders
      acc.materials.orders_created += metric.material_orders_created || 0;
      acc.materials.delays_detected += metric.delays_detected || 0;
      
      // Bucket 4: Homeowner Portal
      acc.homeowner.portal_views += metric.homeowner_portal_views || 0;
      acc.homeowner.payments_collected += metric.homeowner_payments_collected || 0;
      
      // Bucket 5: Payments
      acc.payments.deposits_collected += metric.deposits_collected || 0;
      acc.payments.invoices_sent += metric.invoices_sent || 0;
      
      // Bucket 6: Field App
      acc.field.photos_uploaded += metric.crew_photos_uploaded || 0;
      
      // Bucket 7: AI & Automations
      acc.ai.insights_generated += metric.ai_insights_generated || 0;
      acc.ai.automations_fired += metric.automations_fired || 0;
      
      acc.total_bugs += metric.bugs_found || 0;
      acc.total_critical_bugs += metric.bugs_critical || 0;
      
      return acc;
    }, {
      outreach: { emails_sent: 0, replies_received: 0, leads_booked: 0 },
      scheduling: { events_created: 0, crew_checkins: 0 },
      materials: { orders_created: 0, delays_detected: 0 },
      homeowner: { portal_views: 0, payments_collected: 0 },
      payments: { deposits_collected: 0, invoices_sent: 0 },
      field: { photos_uploaded: 0 },
      ai: { insights_generated: 0, automations_fired: 0 },
      total_bugs: 0,
      total_critical_bugs: 0
    }) || {
      outreach: { emails_sent: 0, replies_received: 0, leads_booked: 0 },
      scheduling: { events_created: 0, crew_checkins: 0 },
      materials: { orders_created: 0, delays_detected: 0 },
      homeowner: { portal_views: 0, payments_collected: 0 },
      payments: { deposits_collected: 0, invoices_sent: 0 },
      field: { photos_uploaded: 0 },
      ai: { insights_generated: 0, automations_fired: 0 },
      total_bugs: 0,
      total_critical_bugs: 0
    };

    return NextResponse.json({
      success: true,
      metrics,
      aggregated,
      period: {
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (error: any) {
    console.error('Error fetching Silent Forge metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}







































