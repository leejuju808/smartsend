import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generatePrediction } from '@/lib/intelligence/engine';

/**
 * POST /api/hq/intel/predict
 * Generate predictions for metrics (churn, growth, campaign performance, etc.)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scope, metric, horizon, org_id } = body;
    
    // Validation
    if (!scope || !metric || !horizon) {
      return NextResponse.json(
        { error: 'Missing required fields: scope, metric, horizon' },
        { status: 400 }
      );
    }
    
    if (!['org', 'global', 'campaign'].includes(scope)) {
      return NextResponse.json(
        { error: 'Invalid scope. Must be: org, global, or campaign' },
        { status: 400 }
      );
    }
    
    if (!['churn', 'growth', 'campaign_reply_rate', 'revenue', 'engagement'].includes(metric)) {
      return NextResponse.json(
        { error: 'Invalid metric' },
        { status: 400 }
      );
    }
    
    if (typeof horizon !== 'number' || horizon < 1 || horizon > 365) {
      return NextResponse.json(
        { error: 'Horizon must be between 1 and 365 days' },
        { status: 400 }
      );
    }
    
    // For org scope, org_id is required
    if (scope === 'org' && !org_id) {
      return NextResponse.json(
        { error: 'org_id is required for org scope' },
        { status: 400 }
      );
    }
    
    const supabase = createServiceClient();
    
    // Generate prediction
    const predictionResult = await generatePrediction({
      scope: scope as 'org' | 'global' | 'campaign',
      metric: metric as any,
      horizon,
      orgId: org_id,
      context: body.context || {}
    });
    
    // Store prediction in database
    const { data: storedPrediction, error: storeError } = await supabase
      .rpc('store_intel_prediction', {
        p_org_id: org_id || null,
        p_scope: scope,
        p_metric: metric,
        p_horizon_days: horizon,
        p_predicted_value: predictionResult.prediction,
        p_confidence: predictionResult.confidence,
        p_drivers: JSON.stringify(predictionResult.drivers),
        p_context: JSON.stringify(body.context || {})
      });
    
    if (storeError) {
      console.error('Error storing prediction:', storeError);
      // Continue even if storage fails
    }
    
    return NextResponse.json({
      prediction: predictionResult.prediction,
      confidence: predictionResult.confidence,
      drivers: predictionResult.drivers,
      prediction_id: storedPrediction || null
    });
    
  } catch (error: any) {
    console.error('Prediction API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate prediction' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/hq/intel/predict
 * Get prediction history for an org
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const metric = searchParams.get('metric');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }
    
    const supabase = createServiceClient();
    
    let query = supabase
      .from('intel_predictions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (metric) {
      query = query.eq('metric', metric);
    }
    
    const { data: predictions, error } = await query;
    
    if (error) {
      console.error('Error fetching predictions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch predictions' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      predictions: predictions || []
    });
    
  } catch (error: any) {
    console.error('Get predictions API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch predictions' },
      { status: 500 }
    );
  }
}

