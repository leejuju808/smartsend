'use client';

import { Card, CardContent } from '@/components/ui/Card';

export default function KPICards({ 
  mrr, 
  arr,
  revenue,
  netChurn,
  expansion,
  arpa
}: { 
  mrr: number; 
  arr: number;
  revenue: number;
  netChurn?: number;
  expansion?: number;
  arpa?: number;
}) {
  const items = [
    { 
      label: 'Total MRR', 
      value: `$${Number(mrr || 0).toFixed(2)}`,
      description: 'Monthly Recurring Revenue'
    },
    { 
      label: 'Total ARR', 
      value: `$${Number(arr || 0).toFixed(2)}`,
      description: 'Annual Recurring Revenue'
    },
    {
      label: 'This Month',
      value: `$${Number(revenue || 0).toFixed(2)}`,
      description: 'Revenue this month'
    },
    {
      label: 'Net MRR Churn (90d)',
      value: `${Number(netChurn || 0).toFixed(2)}%`,
      description: 'Average net churn rate'
    },
    {
      label: 'Expansion (90d)',
      value: `${Number(expansion || 0).toFixed(2)}%`,
      description: 'Average expansion rate'
    },
    {
      label: 'ARPA',
      value: `$${Number(arpa || 0).toFixed(2)}`,
      description: 'Average Revenue Per Account'
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {items.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-6">
            <div className="text-xs uppercase opacity-70 mb-2">{i.label}</div>
            <div className="text-3xl font-bold mb-1">{i.value}</div>
            {i.description && (
              <div className="text-xs text-gray-500">{i.description}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

