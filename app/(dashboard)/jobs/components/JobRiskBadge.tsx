// Block 22600 — SmartSend Roofing Job Forecasting & Variance Alerts v1
// Job Risk Badge Component
// Displays risk status for a job

"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ForecastData {
  forecast: {
    margin: number;
  };
  budget: {
    margin: number;
  };
}

function getRiskStatus(forecastMargin: number, budgetMargin: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (forecastMargin < 25) {
    return {
      label: "Critical",
      color: "text-red-400",
      bgColor: "bg-red-600/10",
    };
  }
  if (forecastMargin < budgetMargin - 5) {
    return {
      label: "At Risk",
      color: "text-yellow-400",
      bgColor: "bg-yellow-600/10",
    };
  }
  return {
    label: "On Track",
    color: "text-green-400",
    bgColor: "bg-green-600/10",
  };
}

export function JobRiskBadge({ jobId }: { jobId: string }) {
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data, error } = useSWR<ForecastData>(
    shouldFetch ? `/api/jobs/${jobId}/forecast-variance` : null,
    fetcher
  );

  // Fetch on hover or mount (for now, fetch on mount for simplicity)
  useEffect(() => {
    // Only fetch if we have a jobId
    if (jobId) {
      setShouldFetch(true);
    }
  }, [jobId]);

  if (!shouldFetch) {
    return (
      <span className="text-xs text-zinc-500">—</span>
    );
  }

  if (error || !data) {
    return (
      <span className="text-xs text-zinc-500">—</span>
    );
  }

  const { forecast, budget } = data;
  const risk = getRiskStatus(forecast.margin, budget.margin);

  return (
    <span
      className={`text-xs font-semibold px-2 py-1 rounded ${risk.color} ${risk.bgColor}`}
    >
      {risk.label}
    </span>
  );
}







































