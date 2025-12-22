// Block 254100 — Operations AI Director: Delay Predictor
// POST /api/operations-ai/predict-delay

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

    // Get job details (try roofing_jobs first, then jobs)
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

    // Get crew efficiency data
    let crewEfficiencyScore: number | undefined;
    let crewInstallSpeed: number | undefined;
    
    if (job.crew_id) {
      const { data: efficiency } = await supabase
        .from('crew_efficiency_scores')
        .select('score, install_speed_score')
        .eq('crew_id', job.crew_id)
        .eq('workspace_id', workspaceId)
        .gte('period_end', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('period_end', { ascending: false })
        .limit(1)
        .single();

      if (efficiency) {
        crewEfficiencyScore = efficiency.score;
        crewInstallSpeed = efficiency.install_speed_score;
      }
    }

    // Get material delivery status
    let materialDeliveryStatus: 'on_time' | 'delayed' | 'pending' = 'pending';
    const { data: supplierOrders } = await supabase
      .from('supplier_orders')
      .select('status')
      .eq('job_id', jobId)
      .limit(1)
      .single();

    if (supplierOrders) {
      if (supplierOrders.status === 'delayed') {
        materialDeliveryStatus = 'delayed';
      } else if (supplierOrders.status === 'delivered') {
        materialDeliveryStatus = 'on_time';
      }
    }

    // Get photo progress
    let photoProgress: any = null;
    const { data: photos } = await supabase
      .from('job_photo_entries')
      .select('ai_detected_stage')
      .eq('job_id', jobId);

    if (photos && photos.length > 0) {
      photoProgress = {
        underlaymentDetected: photos.some(p => p.ai_detected_stage === 'underlayment'),
        installDetected: photos.some(p => p.ai_detected_stage === 'install'),
        latestStage: photos[photos.length - 1]?.ai_detected_stage
      };
    }

    // Get weather forecast (if weather_intelligence table exists)
    let weatherForecast: string | undefined;
    if (job.scheduled_start_date) {
      const { data: weather } = await supabase
        .from('weather_intelligence')
        .select('forecast_summary')
        .eq('job_id', jobId)
        .eq('forecast_date', job.scheduled_start_date)
        .limit(1)
        .single();

      if (weather) {
        weatherForecast = weather.forecast_summary;
      }
    }

    // Predict delay using AI
    const prediction = await OperationsAIDirector.predictDelay({
      jobId,
      crewId: job.crew_id,
      crewEfficiencyScore,
      crewInstallSpeed,
      scheduledStartDate: job.scheduled_start_date || job.scheduled_start || '',
      jobType: job.job_type,
      estimatedSquares: job.estimated_squares || job.official_squares,
      weatherForecast,
      materialDeliveryStatus,
      photoProgress
    });

    // Save prediction to database
    const { data: savedPrediction, error: saveError } = await supabase
      .from('ai_predictions')
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        prediction_type: 'delay',
        confidence: prediction.confidence,
        message: `Job is projected to finish ${prediction.predicted_delay_hours.toFixed(1)} hours late. ${prediction.reasons.join(' ')}`,
        prediction_data: {
          predicted_delay_hours: prediction.predicted_delay_hours,
          reasons: prediction.reasons,
          recommendation: prediction.recommendation
        }
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving prediction:', saveError);
    }

    return NextResponse.json({
      prediction: {
        ...prediction,
        id: savedPrediction?.id
      }
    });
  } catch (error: any) {
    console.error('Error predicting delay:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to predict delay' },
      { status: 500 }
    );
  }
}






















