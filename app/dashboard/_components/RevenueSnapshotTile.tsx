"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  total_pipeline: number;
  total_expected: number;
  high_value_jobs: number;
  error?: string;
};

export default function RevenueSnapshotTile() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/revenue-snapshot");
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          setSnapshot({ total_pipeline: 0, total_expected: 0, high_value_jobs: 0, error: errorData.error || "Failed to load" });
          return;
        }
        const data = await res.json();
        setSnapshot(data);
      } catch (e) {
        console.error("Failed to load revenue snapshot", e);
        setSnapshot({ total_pipeline: 0, total_expected: 0, high_value_jobs: 0, error: "Network error" });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-sm border flex items-center justify-center">
        <p className="text-xs text-gray-500">Loading revenue snapshot…</p>
      </div>
    );
  }

  if (!snapshot || snapshot.error) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-sm border">
        <p className="text-xs text-red-500">
          Couldn't load revenue snapshot. Try refreshing.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Roofing Revenue Snapshot
          </h2>
          <p className="text-[11px] text-gray-500">
            Live estimate of your active pipeline.
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full border text-gray-600">
          SmartSend Engine v1
        </span>
      </div>

      {/* Main numbers */}
      <div className="grid grid-cols-3 gap-3 mt-1">
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">
            Total Pipeline
          </span>
          <span className="text-base font-semibold text-gray-900">
            {formatCurrency(snapshot.total_pipeline)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">
            Expected Revenue
          </span>
          <span className="text-base font-semibold text-emerald-700">
            {formatCurrency(snapshot.total_expected)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">
            High-Value Jobs
          </span>
          <span className="text-base font-semibold text-gray-900">
            {snapshot.high_value_jobs}
          </span>
          <span className="text-[10px] text-gray-500">
            {snapshot.high_value_jobs === 1
              ? "Job ≥ $15k"
              : "Jobs ≥ $15k"}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 mt-1">
        These are estimates based on your SmartSend job value engine and deal
        stages. Actual results may vary.
      </p>
    </div>
  );
}

