/**
 * Block 170000: Move Job Between Stages
 * POST /api/pipeline/jobs/[id]/move
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { stage_id } = body;

    if (!stage_id) {
      return NextResponse.json(
        { error: 'stage_id is required' },
        { status: 400 }
      );
    }

    // Get current job to check stage
    const { data: currentJob } = await supabase
      .from('jobs')
      .select('stage_id')
      .eq('id', params.id)
      .single();

    // Update stage (trigger will log activity)
    const { data: job, error } = await supabase
      .from('jobs')
      .update({ stage_id })
      .eq('id', params.id)
      .select(`
        *,
        job_stages:stage_id (*)
      `)
      .single();

    if (error) {
      console.error('Error moving job:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      job,
    });
  } catch (error: any) {
    console.error('Error moving job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


























