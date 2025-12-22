import { Card, CardContent } from '@/components/ui/Card';

interface Overview {
  total_mrr?: number;
  total_arr?: number;
  active_orgs_30d?: number;
  events_24h?: number;
  events_7d?: number;
}

interface HQCardsProps {
  overview: Overview | null;
}

export default function HQCards({ overview }: HQCardsProps) {
  const items = [
    { 
      label: 'Total MRR', 
      value: `$${Number(overview?.total_mrr || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` 
    },
    { 
      label: 'Total ARR', 
      value: `$${Number(overview?.total_arr || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` 
    },
    { 
      label: 'Active Orgs (30d)', 
      value: overview?.active_orgs_30d || 0 
    },
    { 
      label: 'Events (24h)', 
      value: overview?.events_24h || 0 
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-6">
            <div className="text-xs uppercase opacity-70 mb-1">{item.label}</div>
            <div className="text-2xl font-bold">{item.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

