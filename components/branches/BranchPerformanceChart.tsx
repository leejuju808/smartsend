"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

interface BranchPerformanceChartProps {
  branchId: string;
}

export function BranchPerformanceChart({ branchId }: BranchPerformanceChartProps) {
  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch performance data from API
    setLoading(false);
  }, [branchId]);

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">Performance</h2>
        </div>
        <div className="text-gray-400">Loading performance data...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-white">Performance Metrics</h2>
      </div>
      <div className="text-gray-400">
        Performance charts will be displayed here
      </div>
    </div>
  );
}





















