"use client";

import { useEffect, useState } from "react";

interface RevenueDashboardData {
  user_id: string;
  total_won_revenue: number;
  revenue_this_month: number;
  estimates_30d: number;
  completed_30d: number;
  jobs_won_30d: number;
  close_rate_percent: number;
  avg_job_value: number;
  expected_pipeline_value: number;
}

export default function RevenueDashboard() {
  const [data, setData] = useState<RevenueDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/revenue-dashboard")
      .then((r) => r.json())
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching revenue dashboard:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="p-4 bg-white border rounded-xl shadow-sm animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-32"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const {
    total_won_revenue,
    revenue_this_month,
    estimates_30d,
    completed_30d,
    jobs_won_30d,
    close_rate_percent,
    avg_job_value,
    expected_pipeline_value,
  } = data;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <Tile 
        label="Total Won Revenue" 
        value={`$${total_won_revenue.toLocaleString()}`} 
      />
      <Tile 
        label="Revenue This Month" 
        value={`$${revenue_this_month.toLocaleString()}`} 
      />
      <Tile 
        label="Estimates (30d)" 
        value={estimates_30d.toString()} 
      />
      <Tile 
        label="Jobs Won (30d)" 
        value={jobs_won_30d.toString()} 
      />
      <Tile 
        label="Close Rate" 
        value={`${Math.round(close_rate_percent)}%`} 
      />
      <Tile 
        label="Average Job Value" 
        value={`$${Math.round(avg_job_value || 0).toLocaleString()}`} 
      />
      <Tile 
        label="Expected Pipeline Value" 
        value={`$${Math.round(expected_pipeline_value || 0).toLocaleString()}`} 
      />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 bg-white border rounded-xl shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}














































