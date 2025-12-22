// Block 254100 — Operations AI Director: Job Schedule Optimizer
// POST /api/operations-ai/optimize-schedule

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

    // Get available crews
    const { data: crews } = await supabase
      .from('crews')
      .select('id, name, is_active')
      .eq('workspace_id', workspaceId)
      .or('is_active.is.null,is_active.eq.true');

    // Get efficiency scores for crews
    const availableCrews = await Promise.all(
      (crews || []).map(async (crew: any) => {
        const { data: efficiency } = await supabase
          .from('crew_efficiency_scores')
          .select('score')
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
          availableDate: job.scheduled_start_date || job.preferred_start_date || new Date().toISOString().split('T')[0]
        };
      })
    );

    // Get weather forecast
    const weatherForecast: any[] = [];
    if (job.scheduled_start_date) {
      const { data: weather } = await supabase
        .from('weather_intelligence')
        .select('forecast_date, forecast_summary, risk_level')
        .eq('job_id', jobId)
        .gte('forecast_date', job.scheduled_start_date)
        .lte('forecast_date', new Date(new Date(job.scheduled_start_date).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (weather) {
        weatherForecast.push(...weather.map((w: any) => ({
          date: w.forecast_date,
          conditions: w.forecast_summary,
          risk: w.risk_level || 'medium'
        })));
      }
    }

    // Get material delivery date
    const { data: materialOrder } = await supabase
      .from('supplier_orders')
      .select('delivery_date')
      .eq('job_id', jobId)
      .limit(1)
      .single();

    // Optimize schedule using AI
    const optimization = await OperationsAIDirector.optimizeSchedule({
      jobId,
      preferredStartDate: job.scheduled_start_date || job.preferred_start_date || new Date().toISOString().split('T')[0],
      jobType: job.job_type || 'roof_replacement',
      estimatedSquares: job.estimated_squares || job.official_squares || 25,
      availableCrews,
      weatherForecast,
      materialDeliveryDate: materialOrder?.delivery_date
    });

    if (!optimization) {
      return NextResponse.json({ error: 'Could not optimize schedule' }, { status: 500 });
    }

    // Save optimization as recommendation
    const { data: savedRecommendation, error: saveError } = await supabase
      .from('ai_recommendations')
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        recommendation_type: 'schedule_shift',
        recommended_value: {
          recommended_start_time: optimization.recommended_start_time,
          recommended_crew_id: optimization.recommended_crew_id,
          material_delivery_time: optimization.material_delivery_time,
          predicted_completion: optimization.predicted_completion,
          weather_risk: optimization.weather_risk,
          confidence: optimization.confidence
        },
        priority: optimization.confidence > 0.8 ? 'high' : 'medium'
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving recommendation:', saveError);
    }

    return NextResponse.json({
      optimization: {
        ...optimization,
        id: savedRecommendation?.id
      }
    });
  } catch (error: any) {
    console.error('Error optimizing schedule:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to optimize schedule' },
      { status: 500 }
    );
  }
}






















