/**
 * Block 23200 — Silent Forge Beta Group: Submit Weekly Feedback
 * POST /api/silent-forge/feedback
 * 
 * Allows beta testers to submit weekly feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      feedback_week_start,
      feedback_week_end,
      outreach_performance_notes,
      scheduling_production_notes,
      material_orders_notes,
      homeowner_portal_notes,
      payments_notes,
      field_app_notes,
      ai_automations_notes,
      biggest_wins,
      biggest_issues,
      critical_blockers,
      feature_requests,
      feature_request_business_critical,
      overall_satisfaction,
      would_recommend
    } = body;

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

    // Calculate week start/end if not provided
    const weekStart = feedback_week_start || (() => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
      const monday = new Date(today.setDate(diff));
      monday.setHours(0, 0, 0, 0);
      return monday.toISOString().split('T')[0];
    })();

    const weekEnd = feedback_week_end || (() => {
      const start = new Date(weekStart);
      start.setDate(start.getDate() + 6);
      return start.toISOString().split('T')[0];
    })();

    // Submit feedback
    const { data: feedback, error } = await supabase
      .from('silent_forge_feedback')
      .insert({
        beta_id: betaEntry.id,
        account_id: account.id,
        feedback_week_start: weekStart,
        feedback_week_end: weekEnd,
        outreach_performance_notes: outreach_performance_notes || null,
        scheduling_production_notes: scheduling_production_notes || null,
        material_orders_notes: material_orders_notes || null,
        homeowner_portal_notes: homeowner_portal_notes || null,
        payments_notes: payments_notes || null,
        field_app_notes: field_app_notes || null,
        ai_automations_notes: ai_automations_notes || null,
        biggest_wins: biggest_wins || null,
        biggest_issues: biggest_issues || null,
        critical_blockers: critical_blockers || null,
        feature_requests: feature_requests || null,
        feature_request_business_critical: feature_request_business_critical || false,
        overall_satisfaction: overall_satisfaction || null,
        would_recommend: would_recommend || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error submitting feedback:', error);
      return NextResponse.json(
        { error: 'Failed to submit feedback', details: error.message },
        { status: 500 }
      );
    }

    // Update beta entry to mark feedback as received
    await supabase
      .from('silent_forge_beta')
      .update({
        last_feedback_at: new Date().toISOString(),
        weekly_feedback_compliant: true,
        feedback_missed_count: 0
      })
      .eq('id', betaEntry.id);

    return NextResponse.json({
      success: true,
      message: 'Weekly feedback submitted successfully',
      feedback_id: feedback.id
    });

  } catch (error: any) {
    console.error('Error submitting Silent Forge feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve feedback history
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Get feedback history
    const { data: feedback, error } = await supabase
      .from('silent_forge_feedback')
      .select('*')
      .eq('beta_id', betaEntry.id)
      .order('feedback_week_start', { ascending: false });

    if (error) {
      console.error('Error fetching feedback:', error);
      return NextResponse.json(
        { error: 'Failed to fetch feedback', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedback
    });

  } catch (error: any) {
    console.error('Error fetching Silent Forge feedback:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}







































