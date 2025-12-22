// Block 254100 — Operations AI Director: Material Forecast & Auto-Order Suggestions
// POST /api/operations-ai/forecast-materials

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

    // Get current materials (from supplier_orders or material_forecasts)
    let currentMaterials: any[] = [];
    const { data: orders } = await supabase
      .from('supplier_orders')
      .select('items')
      .eq('job_id', jobId)
      .eq('status', 'delivered')
      .limit(1)
      .single();

    if (orders?.items) {
      currentMaterials = Array.isArray(orders.items) ? orders.items : [];
    }

    // Get forecasted materials
    let forecastedMaterials: any[] = [];
    const { data: forecast } = await supabase
      .from('material_forecasts')
      .select('forecasted_items')
      .eq('job_id', jobId)
      .limit(1)
      .single();

    if (forecast?.forecasted_items) {
      forecastedMaterials = Array.isArray(forecast.forecasted_items) ? forecast.forecasted_items : [];
    }

    // Get weather forecast
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

    // Forecast material needs using AI
    const forecasts = await OperationsAIDirector.forecastMaterialNeeds({
      jobId,
      jobType: job.job_type || 'roof_replacement',
      estimatedSquares: job.estimated_squares || job.official_squares || 25,
      roofPitch: job.roof_pitch,
      layers: job.layers || 1,
      shingleType: job.shingle_type,
      currentMaterials,
      forecastedMaterials,
      weatherForecast
    });

    // Save high-urgency forecasts as recommendations
    const highUrgencyForecasts = forecasts.filter(f => f.urgency === 'high' || f.urgency === 'critical');
    
    for (const forecast of highUrgencyForecasts) {
      await supabase
        .from('ai_recommendations')
        .insert({
          workspace_id: workspaceId,
          job_id: jobId,
          recommendation_type: 'material_order',
          recommended_value: {
            material_name: forecast.material_name,
            quantity: forecast.quantity,
            unit: forecast.unit,
            urgency: forecast.urgency,
            reasoning: forecast.reasoning,
            estimated_shortage: forecast.estimated_shortage
          },
          priority: forecast.urgency === 'critical' ? 'critical' : 'high'
        });
    }

    return NextResponse.json({
      forecasts,
      recommendations: highUrgencyForecasts
    });
  } catch (error: any) {
    console.error('Error forecasting materials:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to forecast materials' },
      { status: 500 }
    );
  }
}






















