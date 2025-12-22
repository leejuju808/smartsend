// Block 28844 — Quote Revival Metrics Component
// Displays key metrics for the quote revival engine

"use client";

interface RevivalMetrics {
  stalled_quotes_count: number;
  revived_quotes_count: number;
  revenue_recovered: number;
  discounts_offered: number;
  discounts_accepted: number;
  jobs_won_after_revival: number;
}

interface Props {
  metrics: RevivalMetrics;
}

export default function QuoteRevivalMetrics({ metrics }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Stalled Quotes */}
      <MetricCard
        label="Stalled Quotes"
        value={metrics.stalled_quotes_count}
        icon="⏸️"
        description="Quotes waiting for revival"
      />

      {/* Revived Quotes */}
      <MetricCard
        label="Revived Quotes"
        value={metrics.revived_quotes_count}
        icon="🔄"
        description="Quotes successfully revived"
      />

      {/* Revenue Recovered */}
      <MetricCard
        label="Revenue Recovered"
        value={`$${Number(metrics.revenue_recovered || 0).toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })}`}
        icon="💰"
        description="Total revenue from revived quotes"
      />

      {/* Discounts Offered */}
      <MetricCard
        label="Discounts Offered"
        value={metrics.discounts_offered}
        icon="🎁"
        description="Price drop offers sent"
      />

      {/* Discounts Accepted */}
      <MetricCard
        label="Discounts Accepted"
        value={metrics.discounts_accepted}
        icon="✅"
        description="Price drop offers accepted"
      />

      {/* Jobs Won After Revival */}
      <MetricCard
        label="Jobs Won After Revival"
        value={metrics.jobs_won_after_revival}
        icon="🏆"
        description="Quotes converted after revival"
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  description,
}: {
  label: string;
  value: string | number;
  icon: string;
  description: string;
}) {
  return (
    <div className="border rounded-2xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{icon}</span>
            <div className="text-sm font-medium text-gray-600">{label}</div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500 mt-1">{description}</div>
        </div>
      </div>
    </div>
  );
}


































