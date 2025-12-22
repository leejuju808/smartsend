// Block 28844 — Quote Revival Engine Dashboard
// Dashboard showing revival metrics and stalled quotes

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QuoteRevivalMetrics from "@/components/quotes/QuoteRevivalMetrics";
import QuoteRevivalSettings from "@/components/quotes/QuoteRevivalSettings";
import StalledQuotesList from "@/components/quotes/StalledQuotesList";

interface RevivalMetrics {
  stalled_quotes_count: number;
  revived_quotes_count: number;
  revenue_recovered: number;
  discounts_offered: number;
  discounts_accepted: number;
  jobs_won_after_revival: number;
}

export default function QuoteRevivalDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<RevivalMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    // Get workspace ID from URL or localStorage
    const params = new URLSearchParams(window.location.search);
    const wsId = params.get("workspace_id") || localStorage.getItem("active_workspace_id");
    setWorkspaceId(wsId);

    if (wsId) {
      fetchMetrics(wsId);
    }
  }, []);

  const fetchMetrics = async (wsId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/quotes/revival/metrics?workspace_id=${wsId}`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error("Error fetching revival metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Quote Revival Engine</h1>
        <p className="text-gray-600 mt-1">
          Recover revenue from stalled quotes with automated follow-ups
        </p>
      </div>

      {/* Metrics Cards */}
      {metrics && <QuoteRevivalMetrics metrics={metrics} />}

      {/* Settings */}
      {workspaceId && <QuoteRevivalSettings workspaceId={workspaceId} />}

      {/* Stalled Quotes List */}
      {workspaceId && <StalledQuotesList workspaceId={workspaceId} />}
    </div>
  );
}


































