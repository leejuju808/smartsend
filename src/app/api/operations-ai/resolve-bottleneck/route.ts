// Block 254100 — Operations AI Director: Bottleneck Resolver
// POST /api/operations-ai/resolve-bottleneck

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { OperationsAIDirector } from '@/lib/ai/operations-director';

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, workspaceId } = body;

    if (!jobId || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing required fields: jobId, workspaceId' },
        { status: 400 }
      );
    }

    // Get job details
    let job: any = null;
    const { data: roofingJob } = await supabase
      .from('roofing_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('workspace_id', workspaceId)
      .single();

    if (roofingJob) {
      job = roofingJob;
    } else {
      const { data: regularJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('workspace_id', workspaceId)
        .single();
      
      if (regularJob) {
        job = regularJob;
      }
    }

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Get task durations to identify slow tasks
    const { data: taskDurations } = await supabase
      .from('job_task_durations')
      .select('task_name, duration_minutes, baseline_duration_minutes')
      .eq('job_id', jobId)
      .not('duration_minutes', 'is', null);

    const slowTasks = (taskDurations || []).map((task: any) => ({
      task: task.task_name,
      duration: task.duration_minutes,
      expected: task.baseline_duration_minutes || task.duration_minutes
    })).filter((task: any) => task.duration > task.expected * 1.2); // 20% slower than baseline

    // Get material delivery status
    const { data: materialOrder } = await supabase
      .from('supplier_orders')
      .select('status')
      .eq('job_id', jobId)
      .limit(1)
      .single();

    const materialDelay = materialOrder?.status === 'delayed';

    // Get available crews for reassignment
    const { data: crews } = await supabase
      .from('crews')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .or('is_active.is.null,is_active.eq.true')
      .neq('id', job.crew_id);

    const availableCrews = (crews || []).map((crew: any) => ({
      id: crew.id,
      name: crew.name || 'Unnamed Crew',
      availableHours: 8 // TODO: Calculate actual available hours
    }));

    // Resolve bottleneck using AI
    const resolution = await OperationsAIDirector.resolveBottleneck({
      jobId,
      slowTasks,
      materialDelay,
      availableCrews
    });

    if (!resolution) {
      return NextResponse.json({ error: 'Could not resolve bottleneck' }, { status: 500 });
    }

    // Save resolution as recommendation
    const { data: savedRecommendation, error: saveError } = await supabase
      .from('ai_recommendations')
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        recommendation_type: 'bottleneck_resolution',
        recommended_value: {
          bottleneck_type: resolution.bottleneck_type,
          recommended_action: resolution.recommended_action,
          predicted_time_saved: resolution.predicted_time_saved,
          details: resolution.details
        },
        priority: resolution.predicted_time_saved > 2 ? 'high' : 'medium'
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving recommendation:', saveError);
    }

    return NextResponse.json({
      resolution: {
        ...resolution,
        id: savedRecommendation?.id
      }
    });
  } catch (error: any) {
    console.error('Error resolving bottleneck:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to resolve bottleneck' },
      { status: 500 }
    );
  }
}






















