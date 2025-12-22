'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import KPICards from '@/components/hq/billing/KPICards';
import RevByApp from '@/components/hq/billing/RevByApp';
import RevByPlan from '@/components/hq/billing/RevByPlan';
import UsageTable from '@/components/hq/billing/UsageTable';
import MRRForecastChart from '@/components/hq/billing/MRRForecastChart';
import ForecastControls from '@/components/hq/billing/ForecastControls';

interface ForecastParams {
  growth_pct?: number;
  churn_pct?: number;
  expansion_pct?: number;
  arpa_growth_pct?: number;
}

export default function HQBilling() {
  const supabase = createClientComponentClient();
  const [byApp, setByApp] = useState<any[]>([]);
  const [byPlan, setByPlan] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({ total_mrr: 0, total_arr: 0 });
  const [usage, setUsage] = useState<any[]>([]);
  const [mrrHistory, setMrrHistory] = useState<any[]>([]);
  const [forecastParams, setForecastParams] = useState<ForecastParams>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch overview KPIs
        const { data: overview } = await supabase.from('vw_hq_overview').select('*').single();
        
        // Fetch revenue by app
        const { data: app } = await supabase.from('vw_rev_this_month').select('*');
        
        // Fetch revenue by plan
        const { data: plan } = await supabase.from('vw_rev_by_plan').select('*');
        
        // Fetch usage data
        const { data: use } = await supabase.from('vw_usage_month').select('*');
        
        // Fetch MRR KPIs (churn, expansion, ARPA)
        const { data: mrrKpis } = await supabase.from('vw_mrr_kpis').select('*');
        
        // Fetch historical MRR data (last 12 months)
        const { data: mrrData } = await supabase
          .from('vw_mrr_components_agg')
          .select('month, ending_mrr')
          .order('month', { ascending: true })
          .limit(12);
        
        // Format historical data for chart
        const formattedHistory = (mrrData || []).map((d: any) => ({
          month: new Date(d.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          mrr: d.ending_mrr || 0,
        }));
        
        // Aggregate churn/expansion metrics across all apps
        const totalChurn = mrrKpis?.reduce((sum: number, k: any) => sum + (k.net_churn_90d || 0), 0) || 0;
        const totalExpansion = mrrKpis?.reduce((sum: number, k: any) => sum + (k.expansion_90d || 0), 0) || 0;
        const avgARPA = (mrrKpis && mrrKpis.length > 0)
          ? mrrKpis.reduce((sum: number, k: any) => sum + (k.arpa || 0), 0) / mrrKpis.length 
          : 0;
        
        setKpis({ 
          total_mrr: overview?.total_mrr || 0, 
          total_arr: overview?.total_arr || 0,
          this_month_revenue: overview?.this_month_revenue || 0,
          net_churn_90d: totalChurn,
          expansion_90d: totalExpansion,
          arpa: avgARPA,
        });
        setByApp(app || []);
        setByPlan(plan || []);
        setUsage(use || []);
        setMrrHistory(formattedHistory);
      } catch (error) {
        console.error('Error fetching billing data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Revenue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Unified revenue intelligence across SmartSend, OpsGrid, and Agent Cloud
          </p>
        </div>
      </div>

      <KPICards 
        mrr={kpis.total_mrr} 
        arr={kpis.total_arr} 
        revenue={kpis.this_month_revenue}
        netChurn={kpis.net_churn_90d}
        expansion={kpis.expansion_90d}
        arpa={kpis.arpa}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevByApp data={byApp} />
        <RevByPlan data={byPlan} />
      </div>

      {/* Revenue Forecasting Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MRRForecastChart history={mrrHistory} forecastParams={forecastParams} />
        </div>
        <div>
          <ForecastControls onParamsChange={setForecastParams} />
        </div>
      </div>

      <UsageTable rows={usage} />
    </div>
  );
}

