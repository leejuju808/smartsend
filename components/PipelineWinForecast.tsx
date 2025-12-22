// Block 22192 — SmartSend Roofing Win Probability Engine v1
// PipelineWinForecast: Shows projected revenue from current pipeline based on win probability

"use client";

import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";

export interface PipelineWinForecastProps {
  workspaceId: string;
}

interface StageForecast {
  stage: string;
  value: number;
  avgWinProb: number;
  weightedValue: number;
  count: number;
}

export function PipelineWinForecast({ workspaceId }: PipelineWinForecastProps) {
  const [forecast, setForecast] = useState<StageForecast[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const response = await fetch(`/api/pipeline/win-forecast?workspace_id=${workspaceId}`);
        if (response.ok) {
          const data = await response.json();
          setForecast(data.stages || []);
        }
      } catch (error) {
        console.error("Error fetching forecast:", error);
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId) {
      fetchForecast();
    }
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Loading forecast...
        </div>
      </div>
    );
  }

  if (!forecast || forecast.length === 0) {
    return null;
  }

  const totalProjected = forecast.reduce(
    (sum, stage) => sum + stage.weightedValue,
    0
  );

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-4">
        Projected Revenue from Current Pipeline
      </h3>

      <div className="space-y-3">
        {forecast.map((stage) => (
          <div
            key={stage.stage}
            className="flex items-center justify-between py-2 border-b border-zinc-800"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm text-zinc-600">{stage.stage}</span>
              <span className="text-xs text-zinc-500">
                {stage.count} jobs
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-zinc-500">
                Avg {stage.avgWinProb}%
              </span>
              <span className="text-sm font-semibold text-blue-600">
                ${formatCurrency(stage.weightedValue)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-300">
            Total projected close this quarter
          </span>
          <span className="text-lg font-bold text-green-400">
            ${formatCurrency(totalProjected)}
          </span>
        </div>
      </div>
    </div>
  );
}









































