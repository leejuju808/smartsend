// Block 21731 — SmartSend Roofing Lead Dashboard v1
// Dashboard Summary Cards Component

interface DashboardSummary {
  total_leads: number;
  hot: number;
  warm: number;
  cold: number;
  avg_heat_score: number;
  projected_revenue: number;
}

interface SummaryCardsProps {
  data: DashboardSummary;
}

export function SummaryCards({ data }: SummaryCardsProps) {
  const card = (label: string, value: string | number) => (
    <div className="rounded-xl bg-white/5 p-4 border border-white/10">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {card("Total Leads", data.total_leads)}
      {card("Hot Leads", data.hot)}
      {card("Warm Leads", data.warm)}
      {card("Cold Leads", data.cold)}
      {card("Avg Heat Score", Math.round(data.avg_heat_score || 0))}
      {card("Projected Revenue", `$${data.projected_revenue.toLocaleString()}`)}
    </div>
  );
}










































