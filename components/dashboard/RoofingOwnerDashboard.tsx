// Block 21731 — SmartSend Roofing Lead Dashboard v1
// Owner Dashboard Component

"use client";

import { useEffect, useState } from "react";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { TopHotLeads } from "@/components/dashboard/TopHotLeads";

interface DashboardSummary {
  total_leads: number;
  hot: number;
  warm: number;
  cold: number;
  avg_heat_score: number;
  projected_revenue: number;
}

interface TopHotLead {
  id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  heat_score: number | null;
  status?: string | null;
}

export function RoofingOwnerDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [topLeads, setTopLeads] = useState<TopHotLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch dashboard summary
        const summaryResponse = await fetch("/api/dashboard/owner-summary");
        if (!summaryResponse.ok) {
          throw new Error("Failed to load dashboard summary");
        }
        const summaryData = await summaryResponse.json();
        setSummary(summaryData);

        // Fetch top leads
        const leadsResponse = await fetch("/api/dashboard/top-leads");
        if (!leadsResponse.ok) {
          throw new Error("Failed to load top leads");
        }
        const leadsData = await leadsResponse.json();
        setTopLeads(leadsData || []);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-white">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-8">
        <div className="text-white">No dashboard data available.</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <SummaryCards data={summary} />

      {/* Top 10 Hottest Leads */}
      <TopHotLeads leads={topLeads} />

      {/* TODO: Add Live Activity Feed (Block 21727) */}
      {/* TODO: Add Estimator Performance (optional for v1) */}
    </div>
  );
}










































