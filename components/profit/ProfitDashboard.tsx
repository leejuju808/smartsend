// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Profit Dashboard Component
// Main dashboard showing job profit cards, underbid alerts, upsell tracker, and heatmap

"use client";

import { useEffect, useState } from "react";
import { JobProfitCards } from "./JobProfitCards";
import { UnderbidAlerts } from "./UnderbidAlerts";
import { UpsellRevenueTracker } from "./UpsellRevenueTracker";
import { ProfitHeatmap } from "./ProfitHeatmap";

interface ProfitDashboardData {
  job_profit_cards: any[];
  underbid_alerts: any[];
  upsell_tracker: {
    total_revenue: number;
    accepted_revenue: number;
    most_accepted: Array<{ suggestion: string; count: number }>;
    total_count: number;
    accepted_count: number;
  };
  profit_heatmap: Array<{
    crew: string;
    avg_profit: number;
    avg_margin: number;
    job_count: number;
  }>;
}

export function ProfitDashboard({ teamId }: { teamId: string }) {
  const [data, setData] = useState<ProfitDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/profit/dashboard?team_id=${teamId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch profit dashboard data");
        }
        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [teamId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading profit dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            AI Profit Maximizer
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time profit analysis • AI price recommendations • Underbid detection • Upsell suggestions
          </p>
        </div>
      </div>

      {/* Underbid Alerts - Top Priority */}
      {data.underbid_alerts.length > 0 && (
        <UnderbidAlerts alerts={data.underbid_alerts} />
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Job Profit Cards */}
        <div className="lg:col-span-2">
          <JobProfitCards jobs={data.job_profit_cards} />
        </div>

        {/* Right Column: Upsell Tracker */}
        <div className="lg:col-span-1">
          <UpsellRevenueTracker tracker={data.upsell_tracker} />
        </div>
      </div>

      {/* Profit Heatmap */}
      <ProfitHeatmap heatmap={data.profit_heatmap} />
    </div>
  );
}





























