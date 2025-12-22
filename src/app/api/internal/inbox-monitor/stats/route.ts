/**
 * Block 19750 — Internal Inbox Monitor API
 * Returns last 24 hours stats for monitoring dashboard
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

    // Check if user is internal/admin (you can add your own admin check here)
    // For now, we'll allow any authenticated user - you should restrict this
    const { data: profile } = await supabase
      .from('profiles')
      .select('beta_access_level')
      .eq('id', user.id)
      .single();

    // Only allow internal users to access this
    if (profile?.beta_access_level !== 'internal') {
      return NextResponse.json({ error: 'Forbidden - Internal access only' }, { status: 403 });
    }

    // Get last 24 hours summary
    const { data: last24h } = await supabase
      .from('v_inbox_rollout_last_24h')
      .select('*')
      .single();

    // Get hot leads captured today
    const { data: hotLeads } = await supabase
      .from('v_inbox_hot_leads_today')
      .select('*')
      .order('latest_capture', { ascending: false });

    // Get recent failures
    const { data: failures } = await supabase
      .from('inbox_inbound_events')
      .select('*')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get open issues
    const { data: openIssues } = await supabase
      .from('inbox_rollout_issues')
      .select('*')
      .eq('status', 'open')
      .order('reported_at', { ascending: false });

    // Get user-by-user breakdown
    const { data: userSummary } = await supabase
      .from('v_inbox_rollout_user_summary')
      .select('*')
      .order('enrolled_at', { ascending: false });

    return NextResponse.json({
      last24h: last24h || {
        active_users: 0,
        replies_received: 0,
        threads_created: 0,
        failures: 0,
        avg_processing_ms: null,
      },
      hotLeads: hotLeads || [],
      failures: failures || [],
      openIssues: openIssues || [],
      userSummary: userSummary || [],
    });
  } catch (error: any) {
    console.error('Error fetching inbox monitor stats:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



















































