"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function RevenueBoard() {
  const { data, error } = useSWR("/api/revenue-metrics", fetcher);

  if (error) {
    return (
      <div className="p-8">
        <div className="text-red-500">Error loading revenue metrics: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            Revenue Autopilot Dashboard
          </h1>
          <p className="text-xl text-gray-400">
            AI-Driven Pricing & Upsell Analytics
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <Tile 
            label="Total MRR" 
            value={data?.mrr ? `$${Number(data.mrr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading..."}
            description={`$${data?.arr ? Number(data.arr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0'} ARR`}
          />
          <Tile 
            label="Upgrade Suggestions" 
            value={data?.upgrades ?? 0}
            description="Last 30 days"
          />
          <Tile 
            label="Discount Offers" 
            value={data?.discounts ?? 0}
            description="Last 30 days"
          />
        </div>

        {/* Recent Actions */}
        {data?.recentActions && (
          <div className="border rounded-2xl p-6 bg-gray-900/50 border-gray-800">
            <h2 className="text-2xl font-semibold mb-4 text-white">Recent Pricing Actions (Last 7 Days)</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-800">
                <div className="text-sm text-gray-400 mb-1">Keep Actions</div>
                <div className="text-3xl font-bold text-blue-400">{data.recentActions.keep || 0}</div>
              </div>
              <div className="bg-amber-900/30 rounded-lg p-4 border border-amber-800">
                <div className="text-sm text-gray-400 mb-1">Upgrade Suggestions</div>
                <div className="text-3xl font-bold text-amber-400">{data.recentActions.upgrade || 0}</div>
              </div>
              <div className="bg-emerald-900/30 rounded-lg p-4 border border-emerald-800">
                <div className="text-sm text-gray-400 mb-1">Discount Offers</div>
                <div className="text-3xl font-bold text-emerald-400">{data.recentActions.discount || 0}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>Revenue Autopilot • Powered by AUREV OS</p>
        </div>
      </div>
    </div>
  );
}

function Tile({label, value, description}: {label: string; value: any; description?: string}) {
  return (
    <div className="border border-gray-800 p-6 rounded-2xl bg-black/60 hover:border-yellow-500/50 transition-colors">
      <p className="text-gray-400 text-sm mb-2">{label}</p>
      <h2 className="text-3xl font-bold text-white mb-1">{value}</h2>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  );
}









