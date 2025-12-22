"use client";

import { useEffect, useState } from "react";

export type RevenueForecast = {
  id: string;
  workspace_id: string;
  forecast_date: string;
  forecast_weighted: number;
  forecast_best_case: number;
  forecast_worst_case: number;
  forecast_historical: number;
  revenue_leakage: number;
  estimator_breakdown: Record<string, {
    total: number;
    weighted: number;
    bestCase: number;
  }>;
  created_at: string;
};

interface RevenueForecastCardProps {
  workspaceId?: string;
  forecast?: RevenueForecast;
}

export function RevenueForecastCard({ workspaceId, forecast: initialForecast }: RevenueForecastCardProps) {
  const [forecast, setForecast] = useState<RevenueForecast | null>(initialForecast || null);
  const [loading, setLoading] = useState(!initialForecast);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialForecast) {
      setForecast(initialForecast);
      setLoading(false);
      return;
    }

    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    // Fetch latest forecast
    fetch(`/api/revenue-forecast?workspace_id=${workspaceId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch forecast");
        return r.json();
      })
      .then((data) => {
        if (data.forecast) {
          setForecast(data.forecast);
        } else {
          // If no forecast exists, trigger computation
          return fetch(`/api/revenue-forecast/compute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace_id: workspaceId }),
          })
            .then((r) => r.json())
            .then((result) => {
              if (result.forecast) {
                setForecast(result.forecast);
              }
            });
        }
      })
      .catch((err) => {
        console.error("Error fetching revenue forecast:", err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [workspaceId, initialForecast]);

  if (loading) {
    return (
      <div className="p-5 bg-white/5 rounded-xl border border-white/10 shadow text-gray-200">
        <h2 className="text-xl font-bold mb-3">Revenue Forecast</h2>
        <div className="text-sm text-gray-400">Loading forecast...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 bg-white/5 rounded-xl border border-white/10 shadow text-gray-200">
        <h2 className="text-xl font-bold mb-3">Revenue Forecast</h2>
        <div className="text-sm text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="p-5 bg-white/5 rounded-xl border border-white/10 shadow text-gray-200">
        <h2 className="text-xl font-bold mb-3">Revenue Forecast</h2>
        <div className="text-sm text-gray-400">No forecast data available.</div>
      </div>
    );
  }

  return (
    <div className="p-5 bg-white/5 rounded-xl border border-white/10 shadow text-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold">Revenue Forecast</h2>
        <div className="text-xs text-gray-400">
          {new Date(forecast.forecast_date).toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <Metric
          label="Weighted Forecast"
          value={`$${formatCurrency(forecast.forecast_weighted)}`}
          highlight
        />
        <Metric
          label="Best Case"
          value={`$${formatCurrency(forecast.forecast_best_case)}`}
        />
        <Metric
          label="Worst Case"
          value={`$${formatCurrency(forecast.forecast_worst_case)}`}
        />
        <Metric
          label="Historical Forecast"
          value={`$${formatCurrency(forecast.forecast_historical)}`}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-white/10">
        <h3 className="font-semibold text-lg mb-2">Revenue Leakage</h3>
        <p className="text-red-400 text-md font-bold">
          ${formatCurrency(forecast.revenue_leakage)}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Lost revenue from missed follow-ups, slow response, ignored leads, and proposal delays
        </p>
      </div>

      {forecast.estimator_breakdown && Object.keys(forecast.estimator_breakdown).length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <h3 className="font-semibold text-lg mb-2">Estimator Breakdown</h3>
          <div className="text-sm space-y-2">
            {Object.entries(forecast.estimator_breakdown).map(([id, data]) => (
              <div
                key={id}
                className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2"
              >
                <div>
                  <div className="font-semibold text-gray-200">
                    {id === "unassigned" ? "Unassigned" : `Estimator ${id.slice(0, 8)}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    Total: ${formatCurrency(data.total)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-yellow-300 font-semibold">
                    ${formatCurrency(data.weighted)}
                  </div>
                  <div className="text-xs text-gray-400">Weighted</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg px-3 py-2 border ${
        highlight
          ? "border-yellow-500/70 bg-yellow-500/10 text-yellow-100"
          : "border-white/10 bg-black/40 text-gray-200"
      }`}
    >
      <span className="text-xs text-gray-400 mb-1">{label}</span>
      <span className="font-semibold text-base">{value}</span>
    </div>
  );
}

function formatCurrency(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}









































