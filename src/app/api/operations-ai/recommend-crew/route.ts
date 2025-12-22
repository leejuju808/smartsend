// Block 254100 — Operations AI Director: Crew Assignment Recommender
// POST /api/operations-ai/recommend-crew

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

    // Get all available crews with their efficiency scores
    const { data: crews } = await supabase
      .from('crews')
      .select('id, name, is_active')
      .eq('workspace_id', workspaceId)
      .or('is_active.is.null,is_active.eq.true');

    if (!crews || crews.length === 0) {
      return NextResponse.json({ error: 'No crews available' }, { status: 404 });
    }

    // Get efficiency scores for each crew
    const availableCrews = await Promise.all(
      crews.map(async (crew) => {
        const { data: efficiency } = await supabase
          .from('crew_efficiency_scores')
          .select('score, install_speed_score, qc_quality_score, safety_score, material_waste_score, on_time_rate_score')
          .eq('crew_id', crew.id)
          .eq('workspace_id', workspaceId)
          .gte('period_end', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('period_end', { ascending: false })
          .limit(1)
          .single();

        return {
          id: crew.id,
          name: crew.name || 'Unnamed Crew',
          efficiencyScore: efficiency?.score || 50,
          installSpeedScore: efficiency?.install_speed_score || 50,
          qcQualityScore: efficiency?.qc_quality_score || 50,
          safetyScore: efficiency?.safety_score || 50,
          materialWasteScore: efficiency?.material_waste_score || 50,
          onTimeRateScore: efficiency?.on_time_rate_score || 50,
          jobsCompleted: 0 // TODO: Get from job history
        };
      })
    );

    // Get crew recommendations using AI
    const recommendation = await OperationsAIDirector.recommendCrew({
      jobId,
      jobType: job.job_type || 'roof_replacement',
      estimatedSquares: job.estimated_squares || job.official_squares,
      roofType: job.roof_type,
      scheduledStartDate: job.scheduled_start_date || job.scheduled_start || '',
      availableCrews
    });

    if (!recommendation) {
      return NextResponse.json({ error: 'Could not generate recommendation' }, { status: 500 });
    }

    // Save recommendation to database
    const { data: savedRecommendation, error: saveError } = await supabase
      .from('ai_recommendations')
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        recommendation_type: 'crew_assignment',
        recommended_value: {
          recommended_crew_id: recommendation.recommended_crew_id,
          recommended_crew_name: recommendation.recommended_crew_name,
          score: recommendation.score,
          reasoning: recommendation.reasoning,
          backup_crew_id: recommendation.backup_crew_id,
          backup_crew_name: recommendation.backup_crew_name,
          avoid_crew_ids: recommendation.avoid_crew_ids || []
        },
        priority: recommendation.score >= 85 ? 'high' : recommendation.score >= 70 ? 'medium' : 'low'
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving recommendation:', saveError);
    }

    return NextResponse.json({
      recommendation: {
        ...recommendation,
        id: savedRecommendation?.id
      }
    });
  } catch (error: any) {
    console.error('Error recommending crew:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to recommend crew' },
      { status: 500 }
    );
  }
}






















