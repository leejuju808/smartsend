// Block 22085 — SmartSend Roofing Smart Pipeline Board v2
// The intelligent, auto-prioritized, AI-enhanced pipeline every roofer DREAMS of

"use client";

import { useState, useEffect } from "react";
import { PipelineColumn } from "./PipelineColumn";
import { JobDetailPanel } from "./JobDetailPanel";
import { cn } from "@/lib/utils";

export interface PipelineJob {
  id: string;
  homeowner_name: string;
  address: string | null;
  email: string;
  phone: string | null;
  lead_source: string;
  job_source_primary: string;
  job_source_secondary: string | null;
  pipeline_stage: string;
  job_health_score: number;
  job_health_trend: "improving" | "declining" | "stable";
  momentum_score: number;
  experience_score: number;
  experience_score_trend: number | null; // Block 22237: Numeric trend (-20 to +20)
  experience_trend: "improving" | "declining" | "stable" | null; // Block 22237: Text trend
  risk_category: "low" | "medium" | "high" | "critical";
  risk_score: number;
  estimated_value: number;
  probability: number;
  win_probability: number | null; // Block 22192: Win Probability Engine v1
  win_probability_reason: string | null; // Block 22192: Win Probability Engine v1
  next_action?: string | null;
  next_action_reason?: string | null;
  estimator_id: string | null;
  estimator_name: string | null;
  is_in_save_mode: boolean;
  save_severity: "low" | "medium" | "high" | "critical" | null;
  days_in_stage: number;
  days_since_last_contact: number | null;
  stage_entered_at: string | null;
  last_contact_at: string | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
  financing_status?: {
    clicked?: boolean;
    started?: boolean;
    prequalified?: boolean;
    approved?: boolean;
    declined?: boolean;
    abandoned?: boolean;
    monthly_payment?: number | null;
    plan_length?: number | null;
  } | null; // Block 36555: Financing status
}

export interface ColumnStats {
  key: string;
  label: string;
  position: number;
  total: number;
  avg_health: number;
  at_risk: number;
  potential_revenue: number;
}

interface SmartPipelineBoardData {
  columns: ColumnStats[];
  jobs_by_stage: Record<string, PipelineJob[]>;
  total_jobs: number;
}

export function SmartPipelineBoard() {
  const [data, setData] = useState<SmartPipelineBoardData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const fetchBoard = async () => {
    try {
      setError(null);
      const res = await fetch("/api/pipeline/smart-board", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Failed to load pipeline board (${res.status})`);
      }
      const json = (await res.json()) as SmartPipelineBoardData;
      setData(json);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard();
    const id = window.setInterval(fetchBoard, 30000); // Refresh every 30 seconds
    return () => window.clearInterval(id);
  }, []);

  const handleJobClick = (job: PipelineJob) => {
    setSelectedJob(job);
    setPanelOpen(true);
  };

  const handlePanelClose = () => {
    setPanelOpen(false);
    setSelectedJob(null);
  };

  const handleJobUpdate = () => {
    fetchBoard(); // Refresh data after update
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <div className="text-lg font-semibold text-white mb-2">
            Loading Smart Pipeline Board...
          </div>
          <div className="text-sm text-gray-400">
            Gathering intelligence metrics...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/50 bg-red-900/10 p-8 text-center">
        <div className="text-sm text-red-400">
          Failed to load Smart Pipeline Board
        </div>
        <div className="text-xs text-red-500/70 mt-2">
          {error.message || "Unknown error"}
        </div>
      </div>
    );
  }

  if (!data || !data.columns) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="text-sm text-gray-400">No pipeline data available</div>
      </div>
    );
  }

  // Sort columns by position
  const sortedColumns = [...data.columns].sort(
    (a, b) => a.position - b.position
  );

  return (
    <>
      <div className="flex gap-4 overflow-x-auto p-4 pb-6 min-h-[calc(100vh-200px)]">
        {sortedColumns.map((column) => {
          const jobs = data.jobs_by_stage[column.key] || [];
          return (
            <PipelineColumn
              key={column.key}
              column={column}
              jobs={jobs}
              onJobClick={handleJobClick}
            />
          );
        })}
      </div>

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          open={panelOpen}
          onClose={handlePanelClose}
          onUpdate={handleJobUpdate}
        />
      )}
    </>
  );
}

