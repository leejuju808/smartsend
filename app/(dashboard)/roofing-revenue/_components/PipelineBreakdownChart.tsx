"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type PipelineBreakdown = {
  newLeads: number;
  claimFiled: number;
  adjusterScheduled: number;
  claimPending: number;
  claimApproved: number;
  installReady: number;
  scheduled: number;
  inProgress: number;
  completed: number;
};

export function PipelineBreakdownChart({ breakdown }: { breakdown: PipelineBreakdown }) {
  const chartData = [
    { stage: "New Leads", count: breakdown.newLeads },
    { stage: "Claim Filed", count: breakdown.claimFiled },
    { stage: "Adjuster Scheduled", count: breakdown.adjusterScheduled },
    { stage: "Claim Pending", count: breakdown.claimPending },
    { stage: "Claim Approved", count: breakdown.claimApproved },
    { stage: "Install Ready", count: breakdown.installReady },
    { stage: "Scheduled", count: breakdown.scheduled },
    { stage: "In Progress", count: breakdown.inProgress },
    { stage: "Completed", count: breakdown.completed },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="stage"
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            angle={-45}
            textAnchor="end"
            height={100}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tick={{ fill: "#6b7280" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
            }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
















































