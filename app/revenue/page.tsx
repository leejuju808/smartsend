"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, AlertCircle, Cloud, PieChart, RefreshCw } from "lucide-react";

interface RevenueDashboard {
  totalPipeline: number;
  hotRevenue: number;
  warmRevenue: number;
  insurancePipeline: number;
  stormPipeline: number;
  jobTypeBreakdown: {
    counts: Record<string, number>;
    percentages: Record<string, number>;
  };
  counts: {
    hot: number;
    warm: number;
    insurance: number;
    storm: number;
    total: number;
  };
  forecasting: {
    thisMonth: number;
    nextMonth: number;
  };
}

export default function RevenuePage() {
  const [dashboard, setDashboard] = useState<RevenueDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/revenue/dashboard");
      const data = await res.json();
      if (data.ok) {
        setDashboard(data.dashboard);
      }
    } catch (error) {
      console.error("Error loading revenue dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      const res = await fetch("/api/revenue/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.ok) {
        // Reload dashboard after recalculation
        await loadDashboard();
      }
    } catch (error) {
      console.error("Error recalculating revenue:", error);
    } finally {
      setRecalculating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading revenue dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Failed to load revenue dashboard</p>
          <button
            onClick={loadDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const jobTypeColors: Record<string, string> = {
    repair: "#3B82F6", // blue
    replacement: "#10B981", // green
    insurance: "#F59E0B", // amber
    storm: "#8B5CF6", // purple
    unknown: "#6B7280", // gray
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Revenue Pipeline
            </h1>
            <p className="text-gray-600">
              Track estimated job value, detect big jobs, and see your real revenue pipeline
            </p>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recalculating..." : "Recalculate"}
          </button>
        </div>

        {/* Main Revenue Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* 1️⃣ Total Revenue in Pipeline */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Total Pipeline</h2>
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {formatCurrency(dashboard.totalPipeline)}
            </p>
            <p className="text-sm text-gray-500">Estimated Total Value</p>
          </div>

          {/* 2️⃣ HOT Revenue */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">HOT Revenue</h2>
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {formatCurrency(dashboard.hotRevenue)}
            </p>
            <p className="text-sm text-gray-500">
              {dashboard.counts.hot} HOT Leads (Ready to Close)
            </p>
          </div>

          {/* 3️⃣ WARM Revenue */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">WARM Revenue</h2>
              <TrendingUp className="h-6 w-6 text-yellow-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {formatCurrency(dashboard.warmRevenue)}
            </p>
            <p className="text-sm text-gray-500">
              {dashboard.counts.warm} WARM Leads (Potential Upcoming Month)
            </p>
          </div>

          {/* 4️⃣ Insurance Pipeline */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-amber-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Insurance Pipeline</h2>
              <DollarSign className="h-6 w-6 text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {formatCurrency(dashboard.insurancePipeline)}
            </p>
            <p className="text-sm text-gray-500">
              {dashboard.counts.insurance} Active Insurance Jobs
            </p>
          </div>

          {/* 5️⃣ Storm Damage Pipeline */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Storm Damage Pipeline</h2>
              <Cloud className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">
              {formatCurrency(dashboard.stormPipeline)}
            </p>
            <p className="text-sm text-gray-500">
              {dashboard.counts.storm} Storm-Affected Homeowners
            </p>
          </div>

          {/* 6️⃣ Revenue Forecasting */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-600">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Forecasting</h2>
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(dashboard.forecasting.thisMonth)}
                </p>
                <p className="text-sm text-gray-500">Estimated closing this month</p>
              </div>
              <div className="pt-2 border-t">
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(dashboard.forecasting.nextMonth)}
                </p>
                <p className="text-sm text-gray-500">Estimated closing next month</p>
              </div>
            </div>
          </div>
        </div>

        {/* Job Type Breakdown */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChart className="h-6 w-6 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Job Type Breakdown</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(dashboard.jobTypeBreakdown.percentages).map(([type, percentage]) => {
              if (dashboard.jobTypeBreakdown.counts[type] === 0) return null;
              
              return (
                <div key={type} className="text-center">
                  <div className="relative w-32 h-32 mx-auto mb-2">
                    <svg className="transform -rotate-90 w-32 h-32">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="#E5E7EB"
                        strokeWidth="8"
                        fill="none"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke={jobTypeColors[type] || "#6B7280"}
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${percentage * 3.516} 352`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold" style={{ color: jobTypeColors[type] }}>
                        {percentage}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 capitalize">
                    {type === "insurance_claim" ? "Insurance" : type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {dashboard.jobTypeBreakdown.counts[type]} jobs
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}





















































