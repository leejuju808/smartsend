"use client";

// Block 74000 — SmartSend Roofing
// "Owner Command Center + Daily Money Dashboard" v1
// The single screen that shows money, leads, jobs, and safety for the entire company

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, TrendingUp, TrendingDown, DollarSign, Users, FileText, Wrench, Shield, Bell } from "lucide-react";
import Link from "next/link";

type DashboardData = {
  moneyToday: {
    projectedRevenue: number;
    activeJobs: number;
    hotLeads: number;
    followupsDueToday: number;
  };
  leadOverview: {
    newLeadsToday: number;
    hotLeads: number;
    warmLeads: number;
    repliesToday: number;
    conversionRate: number;
  };
  estimatePerformance: {
    estimatesSentToday: number;
    pendingEstimates: number;
    pendingEstimatesValue: number;
    followupsDue: Array<{
      id: string;
      due_date: string;
      estimate_id: string;
      lead_id: string;
    }>;
    lastActivity: Array<{
      lead_id: string;
      sent_at: string;
    }>;
  };
  jobPipeline: {
    scheduled: { count: number; value: number };
    inProduction: { count: number; value: number };
    delayed: { count: number; value: number };
    completed: { count: number; value: number };
  };
  safetySnapshot: {
    ppeNonCompliance: number;
    missingToolboxTalkToday: boolean;
    openIncidents: number;
    criticalIncidents: number;
  };
  smartAlerts: {
    hotLeadsNoEstimate: Array<{
      id: string;
      name: string | null;
      email: string | null;
    }>;
    overdueFollowups: Array<{
      id: string;
      due_date: string;
      estimate_id: string;
      lead_id: string;
    }>;
    jobsNoSchedule: Array<{
      id: string;
      lead_id: string;
      stage: string;
    }>;
  };
};

export function OwnerCommandCenter() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/command-center")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch dashboard data");
        return r.json();
      })
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load command center:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 text-sm text-gray-400">
        Loading command center…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-red-500/20 border border-red-500/40 p-6 text-sm text-red-300">
        {error || "Failed to load dashboard data"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* TOP BAR — Money Today Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MoneyMetricCard
          label="Projected Revenue (Next 30 Days)"
          value={data.moneyToday.projectedRevenue}
          icon={<DollarSign className="w-5 h-5" />}
          trend="up"
        />
        <MoneyMetricCard
          label="Active Jobs"
          value={data.moneyToday.activeJobs}
          icon={<Wrench className="w-5 h-5" />}
        />
        <MoneyMetricCard
          label="Hot Leads"
          value={data.moneyToday.hotLeads}
          icon={<Users className="w-5 h-5" />}
          highlight
        />
        <MoneyMetricCard
          label="Follow-Ups Due Today"
          value={data.moneyToday.followupsDueToday}
          icon={<FileText className="w-5 h-5" />}
          alert={data.moneyToday.followupsDueToday > 0}
        />
      </div>

      {/* SECTION 1 — Lead & Revenue Overview */}
      <div className="rounded-xl bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-transparent border border-blue-500/40 p-6">
        <h2 className="text-lg font-semibold text-blue-300 mb-4">Lead & Revenue Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="New Leads Today"
            value={data.leadOverview.newLeadsToday}
            highlight={data.leadOverview.newLeadsToday > 0}
          />
          <StatCard
            label="Hot Leads"
            value={data.leadOverview.hotLeads}
            highlight
          />
          <StatCard
            label="Warm Leads"
            value={data.leadOverview.warmLeads}
          />
          <StatCard
            label="Replies Today"
            value={data.leadOverview.repliesToday}
            highlight={data.leadOverview.repliesToday > 0}
          />
          <StatCard
            label="Conversion Rate"
            value={`${data.leadOverview.conversionRate.toFixed(1)}%`}
            highlight={data.leadOverview.conversionRate > 20}
          />
          <StatCard
            label="Estimate Needed"
            value={data.smartAlerts.hotLeadsNoEstimate.length}
            alert={data.smartAlerts.hotLeadsNoEstimate.length > 0}
          />
        </div>
      </div>

      {/* SECTION 2 — Estimate Performance */}
      <div className="rounded-xl bg-gradient-to-r from-green-500/20 via-green-400/10 to-transparent border border-green-500/40 p-6">
        <h2 className="text-lg font-semibold text-green-300 mb-4">Estimate Performance</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatCard
                label="Estimates Sent Today"
                value={data.estimatePerformance.estimatesSentToday}
              />
              <StatCard
                label="Total Pending"
                value={data.estimatePerformance.pendingEstimates}
              />
            </div>
            <div className="bg-black/40 rounded-lg p-4 border border-white/10">
              <div className="text-xs text-gray-400 mb-2">Pending Value</div>
              <div className="text-2xl font-bold text-green-300">
                ${data.estimatePerformance.pendingEstimatesValue.toLocaleString()}
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-300 mb-2">Follow-ups Due</div>
            {data.estimatePerformance.followupsDue.length === 0 ? (
              <div className="text-sm text-gray-500">No follow-ups due</div>
            ) : (
              <div className="space-y-2">
                {data.estimatePerformance.followupsDue.slice(0, 5).map((fu) => (
                  <div
                    key={fu.id}
                    className="flex items-center justify-between rounded-lg bg-black/40 border border-white/10 px-3 py-2"
                  >
                    <div className="text-sm text-white">
                      Estimate #{fu.estimate_id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-400">
                      Due {formatDistanceToNow(new Date(fu.due_date), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3 — Job Pipeline */}
      <div className="rounded-xl bg-gradient-to-r from-purple-500/20 via-purple-400/10 to-transparent border border-purple-500/40 p-6">
        <h2 className="text-lg font-semibold text-purple-300 mb-4">Job Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <PipelineStageCard
            label="Scheduled"
            count={data.jobPipeline.scheduled.count}
            value={data.jobPipeline.scheduled.value}
            color="blue"
          />
          <PipelineStageCard
            label="In Production"
            count={data.jobPipeline.inProduction.count}
            value={data.jobPipeline.inProduction.value}
            color="green"
          />
          <PipelineStageCard
            label="Delayed"
            count={data.jobPipeline.delayed.count}
            value={data.jobPipeline.delayed.value}
            color="red"
            alert={data.jobPipeline.delayed.count > 0}
          />
          <PipelineStageCard
            label="Completed"
            count={data.jobPipeline.completed.count}
            value={data.jobPipeline.completed.value}
            color="gray"
          />
        </div>
      </div>

      {/* SECTION 4 — Safety Snapshot */}
      <div className="rounded-xl bg-gradient-to-r from-red-500/20 via-red-400/10 to-transparent border border-red-500/40 p-6">
        <h2 className="text-lg font-semibold text-red-300 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Safety Snapshot
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="PPE Non-Compliance"
            value={data.safetySnapshot.ppeNonCompliance}
            alert={data.safetySnapshot.ppeNonCompliance > 0}
          />
          <StatCard
            label="Missing Toolbox Talk"
            value={data.safetySnapshot.missingToolboxTalkToday ? "Yes" : "No"}
            alert={data.safetySnapshot.missingToolboxTalkToday}
          />
          <StatCard
            label="Open Incidents"
            value={data.safetySnapshot.openIncidents}
            alert={data.safetySnapshot.openIncidents > 0}
          />
          <StatCard
            label="Critical Incidents"
            value={data.safetySnapshot.criticalIncidents}
            alert={data.safetySnapshot.criticalIncidents > 0}
            highlight={data.safetySnapshot.criticalIncidents > 0}
          />
        </div>
      </div>

      {/* SECTION 5 — Smart Alerts */}
      <div className="rounded-xl bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-transparent border border-yellow-500/40 p-6">
        <h2 className="text-lg font-semibold text-yellow-300 mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Smart Alerts
        </h2>
        <div className="space-y-4">
          {/* Hot Leads No Estimate */}
          {data.smartAlerts.hotLeadsNoEstimate.length > 0 && (
            <AlertSection
              title={`${data.smartAlerts.hotLeadsNoEstimate.length} Hot Leads have no estimate request`}
              items={data.smartAlerts.hotLeadsNoEstimate.map((lead) => ({
                id: lead.id,
                text: lead.name || lead.email || "Unknown",
                link: `/leads/${lead.id}`,
              }))}
              type="warning"
            />
          )}

          {/* Overdue Follow-ups */}
          {data.smartAlerts.overdueFollowups.length > 0 && (
            <AlertSection
              title={`${data.smartAlerts.overdueFollowups.length} Estimates overdue for follow-up`}
              items={data.smartAlerts.overdueFollowups.map((fu) => ({
                id: fu.id,
                text: `Estimate #${fu.estimate_id.slice(0, 8)} - Due ${formatDistanceToNow(new Date(fu.due_date), { addSuffix: true })}`,
                link: `/leads/${fu.lead_id}`,
              }))}
              type="error"
            />
          )}

          {/* Jobs No Schedule */}
          {data.smartAlerts.jobsNoSchedule.length > 0 && (
            <AlertSection
              title={`${data.smartAlerts.jobsNoSchedule.length} Jobs have no scheduled date`}
              items={data.smartAlerts.jobsNoSchedule.map((job) => ({
                id: job.id,
                text: `Job #${job.id.slice(0, 8)} - Stage: ${job.stage}`,
                link: `/jobs/${job.id}`,
              }))}
              type="warning"
            />
          )}

          {data.smartAlerts.hotLeadsNoEstimate.length === 0 &&
            data.smartAlerts.overdueFollowups.length === 0 &&
            data.smartAlerts.jobsNoSchedule.length === 0 && (
              <div className="text-sm text-gray-400">No alerts at this time. Everything looks good!</div>
            )}
        </div>
      </div>
    </div>
  );
}

function MoneyMetricCard({
  label,
  value,
  icon,
  trend,
  highlight,
  alert,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  trend?: "up" | "down";
  highlight?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight
          ? "bg-gradient-to-br from-yellow-500/20 to-yellow-400/10 border-yellow-500/40"
          : alert
          ? "bg-gradient-to-br from-red-500/20 to-red-400/10 border-red-500/40"
          : "bg-gradient-to-br from-white/5 to-white/0 border-white/10"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-gray-400">{icon}</div>
        {trend && (
          <div className={trend === "up" ? "text-green-400" : "text-red-400"}>
            {trend === "up" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div
        className={`text-2xl font-bold ${
          highlight ? "text-yellow-300" : alert ? "text-red-300" : "text-white"
        }`}
      >
        {typeof value === "number" && label.includes("Revenue")
          ? `$${value.toLocaleString()}`
          : value.toLocaleString()}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  alert,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        highlight
          ? "bg-yellow-500/10 border-yellow-500/40"
          : alert
          ? "bg-red-500/10 border-red-500/40"
          : "bg-black/40 border-white/10"
      }`}
    >
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div
        className={`text-lg font-semibold ${
          highlight ? "text-yellow-300" : alert ? "text-red-300" : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PipelineStageCard({
  label,
  count,
  value,
  color,
  alert,
}: {
  label: string;
  count: number;
  value: number;
  color: "blue" | "green" | "red" | "gray";
  alert?: boolean;
}) {
  const colorClasses = {
    blue: "bg-blue-500/10 border-blue-500/40 text-blue-300",
    green: "bg-green-500/10 border-green-500/40 text-green-300",
    red: "bg-red-500/10 border-red-500/40 text-red-300",
    gray: "bg-gray-500/10 border-gray-500/40 text-gray-300",
  };

  return (
    <div className={`rounded-lg p-4 border ${colorClasses[color]}`}>
      <div className="text-xs text-gray-400 mb-2">{label}</div>
      <div className="text-2xl font-bold mb-1">{count}</div>
      <div className="text-sm text-gray-300">${value.toLocaleString()}</div>
    </div>
  );
}

function AlertSection({
  title,
  items,
  type,
}: {
  title: string;
  items: Array<{ id: string; text: string; link: string }>;
  type: "warning" | "error";
}) {
  return (
    <div
      className={`rounded-lg p-4 border ${
        type === "error"
          ? "bg-red-500/10 border-red-500/40"
          : "bg-yellow-500/10 border-yellow-500/40"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle
          className={`w-4 h-4 ${
            type === "error" ? "text-red-400" : "text-yellow-400"
          }`}
        />
        <div
          className={`text-sm font-semibold ${
            type === "error" ? "text-red-300" : "text-yellow-300"
          }`}
        >
          {title}
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.link}
            className="block rounded bg-black/40 border border-white/10 px-3 py-2 text-sm text-white hover:bg-black/60 transition-colors"
          >
            {item.text}
          </Link>
        ))}
      </div>
    </div>
  );
}



























