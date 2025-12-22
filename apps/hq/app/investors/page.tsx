"use client";

import { useEffect, useState } from "react";
import { Card } from "@aurev/ui";

interface InvestorMetrics {
  arr: number;
  orgs: number;
  retention: number;
  automations: number;
  active_orgs?: number;
  last_updated?: string;
}

export default function InvestorPortal() {
  const [data, setData] = useState<InvestorMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/investor-metrics");
        if (!res.ok) throw new Error("Failed to fetch metrics");
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading investor metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Error loading metrics</p>
      </div>
    );
  }

  const metrics = data || {
    arr: 0,
    orgs: 0,
    retention: 0,
    automations: 0,
  };

  // Convert ARR from cents to millions
  const arrMillions = (metrics.arr / 100 / 1e6).toFixed(1);

  return (
    <div className="min-h-screen p-10 max-w-7xl mx-auto space-y-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-amber-400 mb-2">
          AUREV Series A Dashboard
        </h1>
        <p className="text-gray-400">
          Real-time metrics for investors • Last updated:{" "}
          {data?.last_updated
            ? new Date(data.last_updated).toLocaleString()
            : "N/A"}
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Metric
          label="ARR (Run Rate)"
          value={`$${arrMillions}M`}
          description="Annual Recurring Revenue"
        />
        <Metric
          label="Active Orgs"
          value={metrics.orgs?.toLocaleString() || "500"}
          description={`${metrics.active_orgs || metrics.orgs} active subscriptions`}
        />
        <Metric
          label="Retention"
          value={`${metrics.retention}%`}
          description="Customer retention rate"
        />
        <Metric
          label="Automations Run/mo"
          value={metrics.automations?.toLocaleString() || "0"}
          description="Automated actions in last 30 days"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <Card className="p-6 border border-gray-800 bg-black/60">
          <h3 className="text-lg font-semibold text-white mb-4">Traction Highlights</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div className="flex justify-between">
              <span>Product Suite</span>
              <span className="text-amber-400">SmartSend + OpsGrid + AgentCloud</span>
            </div>
            <div className="flex justify-between">
              <span>Market Position</span>
              <span className="text-amber-400">AI Operating System for SMBs</span>
            </div>
            <div className="flex justify-between">
              <span>Growth Model</span>
              <span className="text-amber-400">Subscription + Marketplace + Usage</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 border border-gray-800 bg-black/60">
          <h3 className="text-lg font-semibold text-white mb-4">Market Opportunity</h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div className="flex justify-between">
              <span>TAM</span>
              <span className="text-amber-400">$40B AI Automation</span>
            </div>
            <div className="flex justify-between">
              <span>Target Segment</span>
              <span className="text-amber-400">SMBs (1-500 employees)</span>
            </div>
            <div className="flex justify-between">
              <span>Competitive Moat</span>
              <span className="text-amber-400">Unified Data + Autonomous AI</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-8 p-6 border border-gray-800 rounded-xl bg-black/60">
        <h3 className="text-lg font-semibold text-white mb-4">Funding Round</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Round</p>
            <p className="text-2xl font-bold text-white">Series A</p>
          </div>
          <div>
            <p className="text-gray-400">Target Raise</p>
            <p className="text-2xl font-bold text-amber-400">$10-15M</p>
          </div>
          <div>
            <p className="text-gray-400">Use of Funds</p>
            <p className="text-xl font-bold text-white">Scale Global Distribution</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card className="p-6 border border-gray-800 bg-black/60">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <h2 className="text-3xl font-bold text-white mb-2">{value}</h2>
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
    </Card>
  );
}

