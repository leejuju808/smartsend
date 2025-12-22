"use client";

// Block 254500 — SmartSend Enterprise Command Center v1
// Branch Performance Reports Component
// Shows automatic weekly/monthly summaries for branches

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Award, AlertTriangle } from "lucide-react";

type BranchPerformance = {
  branch_id: string;
  branch_name: string;
  city: string | null;
  state: string;
  jobs_completed: number;
  total_revenue: number;
  margin_percent: number;
  avg_install_speed_hours: number;
  customer_satisfaction: number;
  safety_score: number;
  crews_count: number;
  crew_efficiency: number;
  material_waste_percent: number;
  performance_wins: number;
  performance_issues: number;
};

export function BranchPerformanceReports() {
  const [branches, setBranches] = useState<BranchPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/enterprise/branches/performance")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch performance data");
        return r.json();
      })
      .then((res) => {
        setBranches(res.branches || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load performance data:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-sm text-gray-400">
        Loading performance reports…
      </div>
    );
  }

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">Branch Performance Reports</h3>
          <p className="text-xs text-gray-400">Weekly/monthly performance summaries</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {branches.map((branch) => (
          <BranchPerformanceCard key={branch.branch_id} branch={branch} />
        ))}
      </div>
    </div>
  );
}

function BranchPerformanceCard({ branch }: { branch: BranchPerformance }) {
  const isHighPerformer = branch.margin_percent >= 35 && branch.customer_satisfaction >= 4.5;
  const isLowPerformer = branch.margin_percent < 30 || branch.safety_score < 70;

  return (
    <div
      className={`rounded-lg border p-4 ${
        isHighPerformer
          ? "bg-green-500/10 border-green-500/30"
          : isLowPerformer
          ? "bg-red-500/10 border-red-500/30"
          : "bg-white/5 border-white/10"
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-semibold text-white mb-1">{branch.branch_name}</h4>
          <p className="text-xs text-gray-400">
            {branch.city && `${branch.city}, `}
            {branch.state}
          </p>
        </div>
        {isHighPerformer && (
          <div className="flex items-center gap-1 text-green-400 text-xs">
            <Award className="w-4 h-4" />
            <span>Top Performer</span>
          </div>
        )}
        {isLowPerformer && (
          <div className="flex items-center gap-1 text-red-400 text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>Needs Attention</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
        <Metric
          label="Jobs Completed"
          value={branch.jobs_completed}
          icon={<TrendingUp className="w-3 h-3" />}
        />
        <Metric
          label="Revenue"
          value={`$${(branch.total_revenue / 1000).toFixed(0)}k`}
          icon={<TrendingUp className="w-3 h-3" />}
        />
        <Metric
          label="Margin"
          value={`${branch.margin_percent.toFixed(1)}%`}
          icon={branch.margin_percent >= 30 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          warning={branch.margin_percent < 30}
        />
        <Metric
          label="Avg Install Speed"
          value={`${branch.avg_install_speed_hours.toFixed(1)} hrs`}
          icon={<TrendingUp className="w-3 h-3" />}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
        <Metric
          label="Customer Satisfaction"
          value={`${branch.customer_satisfaction.toFixed(1)}/5.0`}
        />
        <Metric
          label="Safety Score"
          value={`${branch.safety_score.toFixed(0)}/100`}
          warning={branch.safety_score < 70}
        />
        <Metric
          label="Crew Efficiency"
          value={`${branch.crew_efficiency.toFixed(0)}%`}
        />
        <Metric
          label="Material Waste"
          value={`${branch.material_waste_percent.toFixed(1)}%`}
          warning={branch.material_waste_percent > 7}
        />
      </div>

      {(branch.performance_wins > 0 || branch.performance_issues > 0) && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-4 text-xs">
            {branch.performance_wins > 0 && (
              <div className="flex items-center gap-1 text-green-400">
                <Award className="w-3 h-3" />
                <span>{branch.performance_wins} win{branch.performance_wins > 1 ? "s" : ""}</span>
              </div>
            )}
            {branch.performance_issues > 0 && (
              <div className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="w-3 h-3" />
                <span>{branch.performance_issues} issue{branch.performance_issues > 1 ? "s" : ""}</span>
              </div>
            )}
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
  warning,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="flex items-center gap-1">
        {icon && <div className={warning ? "text-orange-400" : "text-gray-400"}>{icon}</div>}
        <span className={`text-sm font-semibold ${warning ? "text-orange-400" : "text-white"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}






















