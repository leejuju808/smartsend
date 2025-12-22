'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface ForecastData {
  base: number[];
  conservative: number[];
  aggressive: number[];
  start: number;
}

interface HistoryData {
  month: string;
  mrr: number;
}

interface MRRForecastChartProps {
  history: HistoryData[];
  forecastParams?: {
    months?: number;
    growth_pct?: number;
    churn_pct?: number;
    expansion_pct?: number;
    arpa_growth_pct?: number;
  };
}

export default function MRRForecastChart({ history, forecastParams = {} }: MRRForecastChartProps) {
  const [fc, setFc] = useState<ForecastData>({
    base: [],
    conservative: [],
    aggressive: [],
    start: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/hq/mrr-forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            months: forecastParams.months || 12,
            growth_pct: forecastParams.growth_pct || 0.08,
            churn_pct: forecastParams.churn_pct || 0.03,
            expansion_pct: forecastParams.expansion_pct || 0.02,
            arpa_growth_pct: forecastParams.arpa_growth_pct || 0.0,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to fetch forecast');
        }

        const data = await res.json();
        setFc(data);
      } catch (err) {
        console.error('Forecast error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load forecast');
      } finally {
        setLoading(false);
      }
    })();
  }, [forecastParams]);

  // Combine historical data with forecast
  const forecastData = history.map(h => ({
    month: h.month,
    actual: h.mrr,
    base: null as number | null,
    conservative: null as number | null,
    aggressive: null as number | null,
  })).concat(
    fc.base.map((v, i) => ({
      month: `+${i + 1}M`,
      actual: null as number | null,
      base: v,
      conservative: fc.conservative[i] || null,
      aggressive: fc.aggressive[i] || null,
    }))
  );

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '';
    return `$${(value / 1000).toFixed(0)}K`;
  };

  const formatTooltipValue = (value: number | null) => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="border rounded-2xl p-4">
        <h3 className="text-sm mb-2 opacity-80">MRR — Actuals & Forecast (12 months)</h3>
        <div className="h-[320px] flex items-center justify-center">
          <div className="text-sm text-gray-500">Loading forecast...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-2xl p-4">
        <h3 className="text-sm mb-2 opacity-80">MRR — Actuals & Forecast (12 months)</h3>
        <div className="h-[320px] flex items-center justify-center">
          <div className="text-sm text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-2xl p-4">
      <h3 className="text-sm mb-2 opacity-80">MRR — Actuals & Forecast (12 months)</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={forecastData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="month" 
            stroke="#6b7280"
            fontSize={12}
          />
          <YAxis 
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={formatCurrency}
          />
          <Tooltip 
            formatter={(value: number | null) => formatTooltipValue(value)}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px',
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="actual" 
            name="Actual" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls={false}
          />
          <Line 
            type="monotone" 
            dataKey="base" 
            name="Base Forecast" 
            stroke="#10b981" 
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
            connectNulls={false}
          />
          <Line 
            type="monotone" 
            dataKey="conservative" 
            name="Conservative" 
            stroke="#f59e0b" 
            strokeWidth={2}
            strokeDasharray="3 3"
            dot={{ r: 3 }}
            connectNulls={false}
          />
          <Line 
            type="monotone" 
            dataKey="aggressive" 
            name="Aggressive" 
            stroke="#8b5cf6" 
            strokeWidth={2}
            strokeDasharray="3 3"
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

