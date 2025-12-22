// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Upsell Revenue Tracker Component
// Shows total upsell revenue, most accepted upsells, and missed opportunities

"use client";

interface UpsellTracker {
  total_revenue: number;
  accepted_revenue: number;
  most_accepted: Array<{ suggestion: string; count: number }>;
  total_count: number;
  accepted_count: number;
}

export function UpsellRevenueTracker({ tracker }: { tracker: UpsellTracker }) {
  const acceptanceRate = tracker.total_count > 0
    ? (tracker.accepted_count / tracker.total_count) * 100
    : 0;

  const missedRevenue = tracker.total_revenue - tracker.accepted_revenue;

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-4">
        Upsell Revenue Tracker
      </h2>

      {/* Key Metrics */}
      <div className="space-y-4 mb-6">
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-400 mb-1">Total Upsell Revenue</div>
          <div className="text-2xl font-bold text-emerald-400">
            ${tracker.total_revenue.toLocaleString()}
          </div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-400 mb-1">Accepted Revenue</div>
          <div className="text-xl font-semibold text-green-400">
            ${tracker.accepted_revenue.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {tracker.accepted_count} of {tracker.total_count} accepted
          </div>
        </div>
        <div className="bg-zinc-800 rounded-lg p-4">
          <div className="text-xs text-zinc-400 mb-1">Acceptance Rate</div>
          <div className="text-lg font-semibold text-amber-400">
            {acceptanceRate.toFixed(1)}%
          </div>
        </div>
        {missedRevenue > 0 && (
          <div className="bg-red-950/20 border border-red-800 rounded-lg p-4">
            <div className="text-xs text-red-300 mb-1">Missed Opportunities</div>
            <div className="text-lg font-semibold text-red-400">
              ${missedRevenue.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Most Accepted Upsells */}
      {tracker.most_accepted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">
            Most Accepted Upsells
          </h3>
          <div className="space-y-2">
            {tracker.most_accepted.map((upsell, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-zinc-800 rounded p-2"
              >
                <div className="text-sm text-zinc-200 flex-1">
                  {upsell.suggestion}
                </div>
                <div className="text-sm font-semibold text-emerald-400">
                  {upsell.count}x
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}





























