/**
 * Block 255000 — Storm Dashboard Stats API
 * GET /api/storm/[stormId]/dashboard - Get real-time dashboard stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { stormId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    // Fetch or compute dashboard stats
    const { data: stats, error: statsError } = await supabase
      .from('storm_dashboard_stats')
      .select('*')
      .eq('storm_id', params.stormId)
      .eq('team_id', teamId)
      .single();

    // If stats don't exist or are stale, compute them
    if (statsError || !stats || !stats.computed_at || 
        new Date(stats.computed_at).getTime() < Date.now() - 60000) { // Stale if > 1 min old
      
      // Trigger computation (would call compute_storm_dashboard_stats function)
      const { error: computeError } = await supabase.rpc('compute_storm_dashboard_stats', {
        p_storm_id: params.stormId,
        p_team_id: teamId
      });

      if (computeError) {
        console.error('Error computing dashboard stats:', computeError);
      }

      // Fetch updated stats
      const { data: updatedStats } = await supabase
        .from('storm_dashboard_stats')
        .select('*')
        .eq('storm_id', params.stormId)
        .eq('team_id', teamId)
        .single();

      if (updatedStats) {
        return NextResponse.json({ stats: updatedStats });
      }
    }

    // Fetch storm details
    const { data: storm } = await supabase
      .from('storm_events')
      .select('storm_type, severity, detected_at, affected_zips, affected_cities')
      .eq('id', params.stormId)
      .single();

    return NextResponse.json({
      stats: stats || {},
      storm: storm || {}
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






















