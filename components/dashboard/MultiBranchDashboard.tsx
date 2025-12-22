"use client";

// Block 254500 — SmartSend Enterprise Command Center v1
// Multi-Branch Dashboard Component
// Shows all branches in one overview with key metrics

import { useEffect, useState } from "react";
import { AlertCircle, TrendingUp, TrendingDown, MapPin, Users, DollarSign, Wrench } from "lucide-react";
import Link from "next/link";

type BranchOverview = {
  branch_id: string;
  branch_name: string;
  city: string | null;
  state: string;
  company_id: string;
  company_name: string;
  revenue: number;
  margin_percent: number;
  crew_efficiency: number;
  jobs_completed: number;
  safety_incidents: number;
  customer_satisfaction: number;
  active_jobs: number;
  active_crews: number;
  branch_staff_count: number;
  low_margin_flag: boolean;
  safety_flag: boolean;
  efficiency_flag: boolean;
};

export function MultiBranchDashboard() {
  const [branches, setBranches] = useState<BranchOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/enterprise/branches/overview")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch branch data");
        return r.json();
      })
      .then((res) => {
        setBranches(res.branches || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load branch overview:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-sm text-gray-400">
        Loading branch overview…
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

  if (branches.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-sm text-gray-400">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Multi-Branch Dashboard</h3>
            <p className="text-xs text-gray-400">View all branches in one overview</p>
          </div>
        </div>
        <p>No branches found. Create your first branch to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Multi-Branch Dashboard</h3>
          <p className="text-xs text-gray-400">All branches at a glance</p>
        </div>
        <Link
          href="/dashboard/enterprise/command-center"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          View Full Command Center →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {branches.map((branch) => (
          <BranchCard key={branch.branch_id} branch={branch} />
        ))}
      </div>
    </div>
  );
}

function BranchCard({ branch }: { branch: BranchOverview }) {
  const hasFlags = branch.low_margin_flag || branch.safety_flag || branch.efficiency_flag;

  return (
    <div
      className={`rounded-lg border p-4 ${
        hasFlags
          ? "bg-yellow-500/5 border-yellow-500/20"
          : "bg-white/5 border-white/10"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <h4 className="font-semibold text-white">{branch.branch_name}</h4>
            {hasFlags && (
              <AlertCircle className="w-4 h-4 text-yellow-500" />
            )}
          </div>
          <p className="text-xs text-gray-400">
            {branch.city && `${branch.city}, `}
            {branch.state}
          </p>
        </div>
        <div className="flex gap-2">
          {branch.low_margin_flag && (
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
              Low Margin
            </span>
          )}
          {branch.safety_flag && (
            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
              Safety
            </span>
          )}
          {branch.efficiency_flag && (
            <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded">
              Efficiency
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Metric
          label="Revenue"
          value={`$${(branch.revenue / 1000).toFixed(0)}k`}
          icon={<DollarSign className="w-3 h-3" />}
          highlight
        />
        <Metric
          label="Margin"
          value={`${branch.margin_percent.toFixed(1)}%`}
          icon={<TrendingUp className="w-3 h-3" />}
          warning={branch.low_margin_flag}
        />
        <Metric
          label="Crew Efficiency"
          value={`${branch.crew_efficiency.toFixed(0)}%`}
          icon={<Wrench className="w-3 h-3" />}
          warning={branch.efficiency_flag}
        />
        <Metric
          label="Jobs Completed"
          value={branch.jobs_completed}
          icon={<Users className="w-3 h-3" />}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-gray-400">Active Jobs:</span>{" "}
          <span className="text-white font-medium">{branch.active_jobs}</span>
        </div>
        <div>
          <span className="text-gray-400">Crews:</span>{" "}
          <span className="text-white font-medium">{branch.active_crews}</span>
        </div>
        <div>
          <span className="text-gray-400">Staff:</span>{" "}
          <span className="text-white font-medium">{branch.branch_staff_count}</span>
        </div>
      </div>

      {branch.safety_incidents > 0 && (
        <div className="mt-2 pt-2 border-t border-red-500/20">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>{branch.safety_incidents} safety incident{branch.safety_incidents > 1 ? "s" : ""} this period</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  highlight,
  warning,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <div className={warning ? "text-orange-400" : highlight ? "text-blue-400" : "text-gray-400"}>{icon}</div>}
      <div>
        <div className={`text-[10px] text-gray-400 uppercase tracking-wide`}>{label}</div>
        <div
          className={`text-sm font-semibold ${
            warning
              ? "text-orange-400"
              : highlight
              ? "text-blue-400"
              : "text-white"
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}






















