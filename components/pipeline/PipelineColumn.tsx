// Block 22085 — Smart Pipeline Board v2: Pipeline Column Component
// Column header with intelligence metrics + job cards

"use client";

import { JobCard } from "./JobCard";
import { PipelineJob, ColumnStats } from "./SmartPipelineBoard";
import { formatCurrency } from "@/lib/utils";

interface PipelineColumnProps {
  column: ColumnStats;
  jobs: PipelineJob[];
  onJobClick: (job: PipelineJob) => void;
}

export function PipelineColumn({
  column,
  jobs,
  onJobClick,
}: PipelineColumnProps) {
  return (
    <div className="min-w-[340px] bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4 flex-shrink-0">
      {/* Column Header with Intelligence Metrics */}
      <ColumnHeader column={column} />

      {/* Jobs List */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
        {jobs.length === 0 ? (
          <div className="text-xs text-gray-500 py-8 text-center">
            No jobs in this stage
          </div>
        ) : (
          jobs.map((job) => (
            <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
          ))
        )}
      </div>
    </div>
  );
}

function ColumnHeader({ column }: { column: ColumnStats }) {
  const getHealthColor = (health: number) => {
    if (health >= 75) return "text-green-400";
    if (health >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="flex flex-col gap-2 pb-2 border-b border-white/10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{column.label}</h2>
        <span className="text-xs text-gray-400 font-medium">
          {column.total} total
        </span>
      </div>

      {/* Intelligence Metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">❤️ Avg Health:</span>
          <span className={getHealthColor(column.avg_health)}>
            {column.avg_health}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500">⚠️ At Risk:</span>
          <span className={column.at_risk > 0 ? "text-red-400 font-semibold" : "text-gray-400"}>
            {column.at_risk}
          </span>
        </div>
      </div>

      {/* Potential Revenue */}
      {column.potential_revenue > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-500">💰 Potential Revenue:</span>
          <span className="text-green-400 font-semibold">
            {formatCurrency(column.potential_revenue)}
          </span>
        </div>
      )}
    </div>
  );
}
