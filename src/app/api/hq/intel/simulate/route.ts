import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/hq/intel/simulate
 * Run simulation scenarios (e.g., "What if we raised prices 10%?")
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org_id, scenario_type, scenario_value } = body;
    
    if (!org_id || !scenario_type || scenario_value === undefined) {
      return NextResponse.json(
        { error: 'org_id, scenario_type, and scenario_value are required' },
        { status: 400 }
      );
    }
    
    const supabase = createServiceClient();
    
    // Get current org state
    const { data: revenue } = await supabase
      .from('org_revenue')
      .select('mrr, arr')
      .eq('org_id', org_id)
      .order('last_sync', { ascending: false })
      .limit(1)
      .single();
    
    const currentMRR = parseFloat(revenue?.mrr || '0');
    const currentARR = parseFloat(revenue?.arr || '0');
    
    // Run simulation based on scenario type
    let results: any = {};
    
    switch (scenario_type) {
      case 'price_increase':
        const newMRR = currentMRR * (1 + scenario_value / 100);
        const newARR = currentARR * (1 + scenario_value / 100);
        results = {
          current_mrr: currentMRR,
          projected_mrr: newMRR,
          mrr_change: newMRR - currentMRR,
          current_arr: currentARR,
          projected_arr: newARR,
          arr_change: newARR - currentARR,
          estimated_churn_impact: scenario_value > 20 ? '+2%' : '+0.5%',
          net_revenue_impact: newMRR * 12 - currentARR
        };
        break;
        
      case 'price_decrease':
        const newMRRDec = currentMRR * (1 - scenario_value / 100);
        const newARRDec = currentARR * (1 - scenario_value / 100);
        results = {
          current_mrr: currentMRR,
          projected_mrr: newMRRDec,
          mrr_change: newMRRDec - currentMRR,
          current_arr: currentARR,
          projected_arr: newARRDec,
          arr_change: newARRDec - currentARR,
          estimated_churn_impact: '-1%',
          net_revenue_impact: newMRRDec * 12 - currentARR
        };
        break;
        
      case 'send_volume':
        results = {
          scenario: `Send volume ${scenario_value > 0 ? 'increase' : 'decrease'} by ${Math.abs(scenario_value)}%`,
          estimated_engagement_impact: scenario_value > 0 ? '+5% reply rate' : '-3% reply rate',
          estimated_deliverability_impact: scenario_value > 20 ? '-2% deliverability' : 'neutral'
        };
        break;
        
      case 'campaign_frequency':
        results = {
          scenario: `Campaign frequency ${scenario_value > 0 ? 'increase' : 'decrease'} by ${Math.abs(scenario_value)}%`,
          estimated_response_impact: scenario_value > 0 ? '+8% total responses' : '-5% total responses',
          estimated_fatigue_risk: scenario_value > 30 ? 'high' : scenario_value > 15 ? 'medium' : 'low'
        };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid scenario_type' },
          { status: 400 }
        );
    }
    
    return NextResponse.json(results);
    
  } catch (error: any) {
    console.error('Simulation API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run simulation' },
      { status: 500 }
    );
  }
}

