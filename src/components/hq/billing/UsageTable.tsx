'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface UsageRow {
  app: string;
  metric: string;
  units: number;
}

export default function UsageTable({ rows }: { rows: UsageRow[] }) {
  const formatMetric = (metric: string) => {
    return metric
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatUnits = (units: number, metric: string) => {
    if (units >= 1000000) {
      return `${(units / 1000000).toFixed(1)}M`;
    } else if (units >= 1000) {
      return `${(units / 1000).toFixed(1)}K`;
    }
    return units.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usage (This Month)</CardTitle>
      </CardHeader>
      <CardContent>
        {rows && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-3 text-gray-600 font-medium">App</th>
                  <th className="pb-3 text-gray-600 font-medium">Metric</th>
                  <th className="pb-3 text-gray-600 font-medium text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 font-medium">
                      <span className="capitalize">{r.app}</span>
                    </td>
                    <td className="py-3 text-gray-600">{formatMetric(r.metric)}</td>
                    <td className="py-3 text-right font-medium">{formatUnits(r.units, r.metric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-sm">No usage data available</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

