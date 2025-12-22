import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get current date and quarter info
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor((now.getMonth() + 3) / 3);
    const quarterName = `Q${quarter}-${year}`;
    
    // Get KPIs for current quarter
    const { data: kpis, error: kpisError } = await supabase
      .from('founder_kpis')
      .select('*')
      .single();

    if (kpisError) {
      throw new Error(`Failed to fetch KPIs: ${kpisError.message}`);
    }

    // Get cash runway
    const { data: cash, error: cashError } = await supabase
      .from('cash_runway')
      .select('*')
      .single();

    if (cashError) {
      throw new Error(`Failed to fetch cash runway: ${cashError.message}`);
    }

    // Fetch historical monthly metrics for comparison
    const { data: monthlyMetrics, error: monthlyError } = await supabase
      .from('monthly_metrics')
      .select('*')
      .order('month_year', { ascending: false })
      .limit(6); // Last 6 months

    // Calculate quarter-over-quarter growth
    let qoqGrowth = null;
    if (monthlyMetrics && monthlyMetrics.length >= 3) {
      const latest3Months = monthlyMetrics.slice(0, 3);
      const previous3Months = monthlyMetrics.slice(3, 6);
      
      const latestMRR = latest3Months.reduce((sum, m) => sum + (m.monthly_revenue || 0), 0);
      const previousMRR = previous3Months.reduce((sum, m) => sum + (m.monthly_revenue || 0), 0);
      
      if (previousMRR > 0) {
        qoqGrowth = ((latestMRR - previousMRR) / previousMRR * 100).toFixed(2);
      }
    }

    // Get additional context metrics
    const [activeUsers, onboardingStats, referralStats] = await Promise.all([
      supabase.from('active_users').select('*').single(),
      supabase.from('onboarding_stats').select('*').single(),
      supabase.from('referral_stats').select('*').single(),
    ]);

    // Compile the report
    const report = {
      quarter: quarterName,
      generated_at: now.toISOString(),
      metrics: {
        mrr: kpis?.mrr || 0,
        arr: (kpis?.mrr || 0) * 12,
        churn: kpis?.churn || 0,
        activation: kpis?.activation || 0,
        partner_roi: kpis?.partner_roi || 0,
        cash_runway_months: cash?.months_left || null,
      },
      context: {
        active_users: activeUsers.data?.active_users || 0,
        total_users: onboardingStats.data?.total || 0,
        activated_referrals: referralStats.data?.activated_referrals || 0,
        total_referrals: referralStats.data?.total_referrals || 0,
      },
      growth: {
        quarter_over_quarter_growth: qoqGrowth ? `${qoqGrowth}%` : 'Insufficient data',
      },
      insights: generateInsights(kpis, cash, qoqGrowth),
      next_quarter_priorities: generatePriorities(kpis, cash),
    };

    // Optionally save to database for historical tracking
    const { error: saveError } = await supabase
      .from('quarterly_reports')
      .upsert({
        quarter: quarterName,
        report_data: report,
        created_at: now.toISOString(),
      }, {
        onConflict: 'quarter'
      });

    if (saveError) {
      console.error('Failed to save quarterly report:', saveError);
      // Continue anyway - report is still generated
    }

    return new Response(
      JSON.stringify(report),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function generateInsights(kpis: any, cash: any, qoqGrowth: string | null) {
  const insights = [];
  
  if (kpis?.mrr >= 83333) { // At least 1/12 of $1M ARR
    insights.push("🎯 Excellent MRR trajectory - on track for $1M ARR within 12 months");
  } else {
    insights.push("⚠️ MRR below target - focus on activation and expansion");
  }
  
  if (kpis?.churn < 5) {
    insights.push("✅ Low churn rate - strong product-market fit");
  } else {
    insights.push("🚨 Churn above 5% - investigate retention levers");
  }
  
  if (kpis?.activation >= 60) {
    insights.push("✅ High activation rate - great onboarding");
  } else {
    insights.push("⚠️ Low activation - simplify first-time success");
  }
  
  if (cash?.months_left && cash.months_left < 6) {
    insights.push("🚨 Low cash runway - prioritize fundraising or profitability");
  } else if (cash?.months_left) {
    insights.push(`✅ ${cash.months_left} months cash runway`);
  }
  
  if (qoqGrowth && parseFloat(qoqGrowth) > 10) {
    insights.push(`📈 Strong ${qoqGrowth}% QoQ growth`);
  }
  
  return insights;
}

function generatePriorities(kpis: any, cash: any) {
  const priorities = [];
  
  if (kpis?.churn > 5) {
    priorities.push("1. Reduce churn to <5% through retention campaigns");
  }
  
  if (kpis?.activation < 60) {
    priorities.push("2. Improve onboarding to reach 60%+ activation");
  }
  
  if (kpis?.partner_roi < 20) {
    priorities.push("3. Increase partner ROI by incentivizing referrals");
  }
  
  if (cash?.months_left && cash.months_left < 12) {
    priorities.push("4. Extend cash runway through MRR growth or fundraising");
  }
  
  if (!priorities.length) {
    priorities.push("Maintain current growth trajectory");
  }
  
  return priorities;
}

