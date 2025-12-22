// Block 21878 — SmartSend Roofing Company Daily Command Center v1
// The One Screen Owners Check Every Morning — Stunning, Simple, Revenue-Focused

"use client";

import { useEffect, useState } from "react";
import { HeaderSection } from "./command-center/HeaderSection";
import { HotLeadsSection } from "./command-center/HotLeadsSection";
import { EstimatorPerformanceSection } from "./command-center/EstimatorPerformanceSection";
import { CriticalAlertsSection } from "./command-center/CriticalAlertsSection";
import { PipelineSummarySection } from "./command-center/PipelineSummarySection";
import { AIRecommendationSection } from "./command-center/AIRecommendationSection";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

export interface CommandCenterData {
  today: {
    revenue_forecast: number;
    jobs_expected_to_close: number;
    new_leads: number;
    jobs_won: number;
    jobs_lost: number;
    revenue_leakage: number;
  };
  hot_leads: Array<{
    id: string;
    name?: string;
    email?: string;
    heat_score: number;
    estimated_job_value?: number;
    status?: string;
  }>;
  stuck_leads: Array<{
    id: string;
    name?: string;
    email?: string;
    status?: string;
    updated_at?: string;
  }>;
  angry_leads: Array<{
    id: string;
    name?: string;
    email?: string;
    homeowner_tone?: string;
  }>;
  high_value_low_prob_leads: Array<{
    id: string;
    name?: string;
    email?: string;
    estimated_job_value?: number;
    job_probability?: number;
  }>;
  estimator_snapshots: Array<{
    estimator_id: string;
    name?: string;
    avg_response_time_seconds?: number;
    missed_followups: number;
    jobs_won: number;
    jobs_lost: number;
    hot_leads_assigned: number;
    performance_badge: string;
  }>;
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
    lead_id?: string;
    estimator_id?: string;
  }>;
  pipeline_summary: {
    counts: Record<string, number>;
    weighted_value: number;
    best_case_value: number;
    jobs_stuck_48h: number;
  };
  recommendation: string;
}

interface CompanyCommandCenterProps {
  workspaceId: string;
}

export function CompanyCommandCenter({ workspaceId }: CompanyCommandCenterProps) {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommandCenter = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/command-center", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: workspaceId }),
        });

        if (!response.ok) {
          throw new Error("Failed to load command center data");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error("Command center fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to load command center");
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId) {
      fetchCommandCenter();
    }
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span>Error: {error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-gray-400">No command center data available.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* SECTION 1 — TODAY'S MONEY METRICS */}
      <HeaderSection forecast={data.today} />

      {/* SECTION 2 — HOT LEADS THAT REQUIRE ACTION */}
      <HotLeadsSection 
        hotLeads={data.hot_leads}
        stuckLeads={data.stuck_leads}
        angryLeads={data.angry_leads}
        highValueLowProbLeads={data.high_value_low_prob_leads}
      />

      {/* SECTION 3 — ESTIMATOR PERFORMANCE SNAPSHOT */}
      <EstimatorPerformanceSection snapshots={data.estimator_snapshots} />

      {/* SECTION 4 — CRITICAL ALERTS */}
      <CriticalAlertsSection alerts={data.alerts} />

      {/* SECTION 5 — PIPELINE SUMMARY */}
      <PipelineSummarySection summary={data.pipeline_summary} />

      {/* SECTION 6 — AI-PRODUCED DAILY INSIGHT */}
      <AIRecommendationSection text={data.recommendation} />
    </div>
  );
}









































