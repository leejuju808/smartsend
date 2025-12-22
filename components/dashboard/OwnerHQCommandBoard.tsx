"use client";

// Block 254500 — SmartSend Enterprise Command Center v1
// Owner HQ Command Board Component
// High-level KPIs for the entire company

import { useEffect, useState } from "react";
import { DollarSign, FileText, Users, Wrench, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

type CommandBoardData = {
  company_id: string;
  company_name: string;
  total_jobs: number;
  jobs_completed: number;
  jobs_active: number;
  revenue_ytd: number;
  revenue_this_month: number;
  revenue_this_year: number;
  avg_margin_percent: number;
  crews_active_today: number;
  crews_working_today: number;
  outstanding_invoices: number;
  material_spend_this_month: number;
  safety_incidents_this_month: number;
  customer_satisfaction_avg: number;
  total_branches: number;
  active_alerts: number;
};

export function OwnerHQCommandBoard() {
  const [data, setData] = useState<CommandBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/enterprise/command-board")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch command board data");
        return r.json();
      })
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load command board:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-sm text-gray-400">
        Loading command board…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-6 text-sm text-red-400">
        Error: {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent border border-blue-500/20 p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">Owner HQ Command Board</h3>
          <p className="text-xs text-gray-400">Company-wide KPIs and performance metrics</p>
        </div>
        {data.active_alerts > 0 && (
          <Link
            href="/dashboard/enterprise/alerts"
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            {data.active_alerts} Active Alert{data.active_alerts > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      {/* Top Row: Revenue Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          label="Revenue YTD"
          value={`$${(data.revenue_ytd / 1000000).toFixed(2)}M`}
          subValue={`$${(data.revenue_this_month / 1000).toFixed(0)}k this month`}
          icon={<DollarSign className="w-5 h-5" />}
          highlight
        />
        <KPICard
          label="Total Jobs"
          value={data.total_jobs}
          subValue={`${data.jobs_active} active, ${data.jobs_completed} completed`}
          icon={<FileText className="w-5 h-5" />}
        />
        <KPICard
          label="Avg Margin"
          value={`${data.avg_margin_percent.toFixed(1)}%`}
          subValue={data.avg_margin_percent >= 30 ? "Healthy" : "Below target"}
          icon={<TrendingUp className="w-5 h-5" />}
          warning={data.avg_margin_percent < 30}
        />
      </div>

      {/* Second Row: Operations Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Crews Active Today"
          value={data.crews_active_today}
          subValue={`${data.crews_working_today} working`}
          icon={<Users className="w-5 h-5" />}
        />
        <KPICard
          label="Outstanding Invoices"
          value={`$${(data.outstanding_invoices / 1000).toFixed(0)}k`}
          subValue="Pending payment"
          icon={<DollarSign className="w-5 h-5" />}
          warning={data.outstanding_invoices > 100000}
        />
        <KPICard
          label="Material Spend"
          value={`$${(data.material_spend_this_month / 1000).toFixed(0)}k`}
          subValue="This month"
          icon={<Wrench className="w-5 h-5" />}
        />
        <KPICard
          label="Safety Incidents"
          value={data.safety_incidents_this_month}
          subValue="This month"
          icon={<AlertTriangle className="w-5 h-5" />}
          warning={data.safety_incidents_this_month > 2}
        />
      </div>

      {/* Third Row: Quality & Scale Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard
          label="Customer Satisfaction"
          value={`${data.customer_satisfaction_avg.toFixed(1)}/5.0`}
          subValue={data.customer_satisfaction_avg >= 4.5 ? "Excellent" : "Good"}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <KPICard
          label="Total Branches"
          value={data.total_branches}
          subValue="Active locations"
          icon={<Users className="w-5 h-5" />}
        />
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
            Quick Actions
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href="/dashboard/enterprise/branches"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View All Branches →
            </Link>
            <Link
              href="/dashboard/enterprise/alerts"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              View Alerts →
            </Link>
            <Link
              href="/dashboard/enterprise/reports"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Performance Reports →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  subValue,
  icon,
  highlight,
  warning,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "bg-blue-500/10 border-blue-500/30"
          : warning
          ? "bg-yellow-500/10 border-yellow-500/30"
          : "bg-white/5 border-white/10"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
        {icon && (
          <div
            className={
              highlight
                ? "text-blue-400"
                : warning
                ? "text-yellow-400"
                : "text-gray-400"
            }
          >
            {icon}
          </div>
        )}
      </div>
      <div
        className={`text-2xl font-bold mb-1 ${
          highlight
            ? "text-blue-400"
            : warning
            ? "text-yellow-400"
            : "text-white"
        }`}
      >
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-gray-400">{subValue}</div>
      )}
    </div>
  );
}






















