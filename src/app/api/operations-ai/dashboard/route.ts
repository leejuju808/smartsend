// Block 254100 — Operations AI Director: Dashboard Report
// GET /api/operations-ai/dashboard

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing required parameter: workspaceId' },
        { status: 400 }
      );
    }

    // Get today's predictions
    const { data: predictions } = await supabase
      .from('ai_predictions')
      .select('id, job_id, prediction_type, confidence, message, prediction_data, created_at')
      .eq('workspace_id', workspaceId)
      .eq('is_resolved', false)
      .gte('created_at', new Date().toISOString().split('T')[0])
      .order('confidence', { ascending: false });

    // Get pending recommendations
    const { data: recommendations } = await supabase
      .from('ai_recommendations')
      .select('id, job_id, recommendation_type, priority, recommended_value, created_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    // Get active alerts
    const { data: alerts } = await supabase
      .from('ai_preventative_alerts')
      .select('id, job_id, alert_type, severity, title, message, created_at')
      .eq('workspace_id', workspaceId)
      .eq('is_resolved', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    // Count by type
    const predictionCounts = {
      delay: predictions?.filter(p => p.prediction_type === 'delay').length || 0,
      crew_mismatch: predictions?.filter(p => p.prediction_type === 'crew_mismatch').length || 0,
      material_shortage: predictions?.filter(p => p.prediction_type === 'material_shortage').length || 0,
      safety_risk: predictions?.filter(p => p.prediction_type === 'safety_risk').length || 0,
      weather_impact: predictions?.filter(p => p.prediction_type === 'weather_impact').length || 0,
      bottleneck: predictions?.filter(p => p.prediction_type === 'bottleneck').length || 0
    };

    const alertCounts = {
      weather_warning: alerts?.filter(a => a.alert_type === 'weather_warning').length || 0,
      crew_performance: alerts?.filter(a => a.alert_type === 'crew_performance').length || 0,
      material_delivery: alerts?.filter(a => a.alert_type === 'material_delivery').length || 0,
      safety_risk: alerts?.filter(a => a.alert_type === 'safety_risk').length || 0
    };

    return NextResponse.json({
      summary: {
        predicted_delays: predictionCounts.delay,
        crew_assignment_issues: predictionCounts.crew_mismatch,
        material_shortages: predictionCounts.material_shortage,
        safety_risks: predictionCounts.safety_risk,
        weather_conflicts: predictionCounts.weather_impact,
        bottlenecks: predictionCounts.bottleneck
      },
      predictions: predictions || [],
      recommendations: recommendations || [],
      alerts: alerts || [],
      alert_counts: alertCounts
    });
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}






















