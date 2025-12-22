import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';

/**
 * GET /api/hq/intel/dashboard
 * Get intelligence dashboard data (KPIs, predictions, recommendations, anomalies)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    
    // Get current org if not provided
    let activeOrgId = orgId;
    if (!activeOrgId) {
      try {
        const org = await getActiveOrg();
        activeOrgId = org?.id;
      } catch (e) {
        // Not logged in or no org
      }
    }
    
    // Get global KPIs
    const { data: revenueData } = await supabase
      .from('org_revenue')
      .select('mrr, arr, churn_rate')
      .eq('org_id', activeOrgId!)
      .order('last_sync', { ascending: false })
      .limit(1)
      .single();
    
    // Get active orgs count (if global view)
    const { count: activeOrgsCount } = await supabase
      .from('orgs')
      .select('*', { count: 'exact', head: true });
    
    // Get recent predictions
    const { data: recentPredictions } = await supabase
      .from('intel_predictions')
      .select('*')
      .eq('org_id', activeOrgId!)
      .order('created_at', { ascending: false })
      .limit(5);
    
    // Get pending recommendations
    const { data: pendingRecommendations } = await supabase
      .from('intel_recommendations')
      .select('*')
      .eq('org_id', activeOrgId!)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Get prediction accuracy stats
    const { data: accuracyStats } = await supabase
      .rpc('get_prediction_accuracy', { p_days_back: 90 });
    
    // Get recent intelligence events
    const { data: recentEvents } = await supabase
      .from('intel_events')
      .select('*')
      .eq('org_id', activeOrgId!)
      .order('created_at', { ascending: false })
      .limit(20);
    
    // Get feedback success rate
    const { data: feedbackData } = await supabase
      .from('intel_feedback')
      .select('success, confidence')
      .eq('org_id', activeOrgId!)
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
    
    const feedbackSuccessRate = feedbackData && feedbackData.length > 0
      ? feedbackData.filter(f => f.success).length / feedbackData.length
      : 0;
    
    const avgConfidence = feedbackData && feedbackData.length > 0
      ? feedbackData.reduce((sum, f) => sum + (parseFloat(String(f.confidence)) || 0), 0) / feedbackData.length
      : 0;
    
    // Calculate global metrics if no org
    const globalKPIs = {
      total_orgs: activeOrgsCount || 0,
      total_mrr: 0,
      total_arr: 0,
      avg_churn_rate: 0
    };
    
    return NextResponse.json({
      kpis: activeOrgId ? {
        mrr: parseFloat(revenueData?.mrr || '0'),
        arr: parseFloat(revenueData?.arr || '0'),
        churn_rate: parseFloat(revenueData?.churn_rate || '0')
      } : globalKPIs,
      predictions: recentPredictions || [],
      recommendations: pendingRecommendations || [],
      accuracy: accuracyStats?.[0] || {
        total_predictions: 0,
        predictions_with_outcomes: 0,
        avg_accuracy: 0,
        avg_confidence: 0
      },
      feedback: {
        success_rate: feedbackSuccessRate,
        avg_confidence: avgConfidence,
        total_actions: feedbackData?.length || 0
      },
      recent_events: recentEvents || []
    });
    
  } catch (error: any) {
    console.error('Intelligence dashboard API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}

