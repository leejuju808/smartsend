/**
 * Block 23200 — Silent Forge Beta Group Admin: List All Beta Testers
 * GET /api/silent-forge/admin/list
 * 
 * Admin endpoint to view all Silent Forge beta testers
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

    // Check if user is admin/internal
    const { data: profile } = await supabase
      .from('profiles')
      .select('beta_access_level')
      .eq('id', user.id)
      .single();

    if (profile?.beta_access_level !== 'internal') {
      return NextResponse.json(
        { error: 'Forbidden - Internal access only' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('silent_forge_beta')
      .select(`
        *,
        silent_forge_metrics(count),
        silent_forge_feedback(count),
        silent_forge_testimonials(count)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: betaTesters, error } = await query;

    if (error) {
      console.error('Error fetching beta testers:', error);
      return NextResponse.json(
        { error: 'Failed to fetch beta testers', details: error.message },
        { status: 500 }
      );
    }

    // Get summary stats
    const { data: stats } = await supabase
      .from('silent_forge_beta')
      .select('status')
      .then(({ data }) => {
        const counts = {
          invited: 0,
          qualified: 0,
          onboarding: 0,
          active: 0,
          paused: 0,
          completed: 0,
          removed: 0,
          total: 0
        };

        data?.forEach((tester: any) => {
          counts[tester.status as keyof typeof counts]++;
          counts.total++;
        });

        return { data: counts };
      });

    return NextResponse.json({
      success: true,
      beta_testers: betaTesters,
      stats
    });

  } catch (error: any) {
    console.error('Error listing Silent Forge beta testers:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}







































