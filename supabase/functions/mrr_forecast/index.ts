import { serve } from "https://deno.land/std@0.216.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ForecastRequest {
  scope?: 'org' | 'global';
  app?: string;
  months?: number;
  growth_pct?: number;
  churn_pct?: number;
  expansion_pct?: number;
  arpa_growth_pct?: number;
}

function seriesForecast(start: number, months: number, g: number): number[] {
  const arr: number[] = [];
  let v = start;
  for (let i = 0; i < months; i++) {
    v = v * (1 + g);
    arr.push(Number(v.toFixed(2)));
  }
  return arr;
}

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const {
      scope = 'global',
      app,
      months = 12,
      growth_pct = 0.08,
      churn_pct = 0.03,
      expansion_pct = 0.02,
      arpa_growth_pct = 0.0,
    }: ForecastRequest = await req.json();

    // Fetch last 6 months of ending_mrr for baseline and std dev calculation
    let q = supa
      .from('vw_mrr_components_agg')
      .select('month, app, ending_mrr')
      .order('month', { ascending: false })
      .limit(6);

    if (scope === 'org') {
      // For org scope, we'd need to join with org_id filter
      // For now, keeping global but can be enhanced
    }

    if (app) {
      q = q.eq('app', app);
    }

    const { data, error } = await q;

    if (error) {
      throw error;
    }

    // Get the most recent ending MRR
    const last = data?.[0]?.ending_mrr || 0;

    // Calculate historical growth rates for std dev
    const historicalGrowth: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i].ending_mrr || 0;
      const curr = data[i - 1].ending_mrr || 0;
      if (prev > 0) {
        historicalGrowth.push((curr - prev) / prev);
      }
    }

    const growthStdDev = historicalGrowth.length > 0 ? calculateStdDev(historicalGrowth) : 0.01;

    // Net monthly growth rate
    const net = growth_pct - churn_pct + expansion_pct;

    // Base forecast
    const base = seriesForecast(last, months, net + arpa_growth_pct);

    // Conservative = Base minus one std dev of historical growth
    const conservative = seriesForecast(
      last,
      months,
      Math.max(net - growthStdDev, -0.2) + arpa_growth_pct
    );

    // Aggressive = Base plus one std dev
    const aggressive = seriesForecast(
      last,
      months,
      net + growthStdDev + arpa_growth_pct
    );

    return new Response(
      JSON.stringify({
        base,
        conservative,
        aggressive,
        start: last,
        historical_std_dev: growthStdDev,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Forecast error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

