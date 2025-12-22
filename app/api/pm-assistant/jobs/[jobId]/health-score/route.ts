/**
 * Block 256500 — AI Project Manager Assistant v1
 * GET /api/pm-assistant/jobs/[jobId]/health-score - Get or calculate job health score
 * POST /api/pm-assistant/jobs/[jobId]/health-score - Manually trigger health score calculation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    // Get latest health score
    const { data: healthScore, error: healthError } = await supabase
      .from('job_health_scores')
      .select('*')
      .eq('job_id', jobId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    if (healthError && healthError.code === 'PGRST116') {
      // No health score exists, calculate it
      const { data: calculatedScore, error: calcError } = await supabase.rpc(
        'calculate_job_health_score',
        { p_job_id: jobId }
      );

      if (calcError) {
        console.error('Error calculating health score:', calcError);
        return NextResponse.json(
          { error: calcError.message },
          { status: 500 }
        );
      }

      // Fetch the calculated score
      const { data: newHealthScore, error: fetchError } = await supabase
        .from('job_health_scores')
        .select('*')
        .eq('job_id', jobId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError) {
        return NextResponse.json(
          { error: fetchError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        health_score: newHealthScore,
        calculated: true,
      });
    }

    if (healthError) {
      return NextResponse.json(
        { error: healthError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      health_score: healthScore,
      calculated: false,
    });
  } catch (error: any) {
    console.error('Error in health score API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    // Calculate health score
    const { data: calculatedScore, error: calcError } = await supabase.rpc(
      'calculate_job_health_score',
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error('Error calculating health score:', calcError);
      return NextResponse.json(
        { error: calcError.message },
        { status: 500 }
      );
    }

    // Fetch the calculated score
    const { data: healthScore, error: fetchError } = await supabase
      .from('job_health_scores')
      .select('*')
      .eq('job_id', jobId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      health_score: healthScore,
      score: calculatedScore,
    });
  } catch (error: any) {
    console.error('Error in health score calculation API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}





















