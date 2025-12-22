"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { colors } from "../constants/colors";
import { formatDistanceToNow } from "date-fns";

interface PipelineJob {
  id: string;
  thread_id: string;
  contact_name: string;
  contact_email: string;
  job_type: string;
  estimated_value: number;
  probability: number;
  pipeline_stage: string;
  expected_close_date: string | null;
  updated_at: string;
}

type SortOption = "value_desc" | "probability_desc" | "close_date_asc";

export function PipelineTab({ onThreadSelect }: { onThreadSelect?: (threadId: string) => void }) {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>("value_desc");

  useEffect(() => {
    fetchPipeline();
  }, [sort]);

  const fetchPipeline = async () => {
    try {
      const params = new URLSearchParams({
        sort: sort,
      });
      const response = await fetch(`/api/inbox/owner/pipeline?${params}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Error fetching pipeline:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatJobType = (jobType: string | null) => {
    if (!jobType) return "Other";
    return jobType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "$0";
    return `$${value.toLocaleString()}`;
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "won":
        return colors.success;
      case "pending":
        return colors.primary;
      case "booked":
        return colors.intent.hot;
      case "lost":
        return colors.inkSecondary;
      default:
        return colors.inkSecondary;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Sort */}
      <div className="p-4 border-b" style={{ borderColor: colors.divider }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: colors.ink }}>
            Job Pipeline
          </h2>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="text-xs px-3 py-1 rounded border"
            style={{ borderColor: colors.divider }}
          >
            <option value="value_desc">Highest Value</option>
            <option value="probability_desc">Highest Probability</option>
            <option value="close_date_asc">Soonest Close Date</option>
          </select>
        </div>
      </div>

      {/* Pipeline Table */}
      <div className="flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="p-8 text-center" style={{ color: colors.inkSecondary }}>
            <p className="text-sm">No jobs in pipeline yet.</p>
            <p className="text-xs mt-1">Mark leads as booked to add them to your pipeline.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: colors.divider }}>
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => onThreadSelect?.(job.thread_id)}
                className="w-full text-left p-4 transition-all hover:bg-opacity-50"
                style={{
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = `${colors.panelBg}80`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold truncate" style={{ color: colors.ink }}>
                        {job.contact_name}
                      </p>
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: getStageColor(job.pipeline_stage) + "20",
                          color: getStageColor(job.pipeline_stage),
                        }}
                      >
                        {job.pipeline_stage.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: colors.inkSecondary }}>
                      {job.contact_email}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs" style={{ color: colors.inkSecondary }}>Job Type</p>
                        <p className="text-sm font-medium" style={{ color: colors.ink }}>
                          {formatJobType(job.job_type)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: colors.inkSecondary }}>Value</p>
                        <p className="text-sm font-semibold" style={{ color: colors.success }}>
                          {formatCurrency(job.estimated_value)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: colors.inkSecondary }}>Probability</p>
                        <p className="text-sm font-medium" style={{ color: colors.primary }}>
                          {job.probability}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs" style={{ color: colors.inkSecondary }}>Last Update</p>
                        <p className="text-xs" style={{ color: colors.inkSecondary }}>
                          {formatDistanceToNow(new Date(job.updated_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    {job.expected_close_date && (
                      <p className="text-xs mt-1" style={{ color: colors.inkSecondary }}>
                        Expected: {new Date(job.expected_close_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

