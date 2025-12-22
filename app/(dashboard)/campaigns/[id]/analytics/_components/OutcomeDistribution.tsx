"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignAnalytics } from "../types";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface OutcomeDistributionProps {
  outcomeDistribution: CampaignAnalytics["outcomeDistribution"];
}

const COLORS = {
  hot: "#ef4444",
  warm: "#f97316",
  notInterested: "#6b7280",
  noReply: "#9ca3af",
  customer: "#10b981",
};

export function OutcomeDistribution({ outcomeDistribution }: OutcomeDistributionProps) {
  const data = [
    {
      name: "Hot Leads",
      value: outcomeDistribution.hot,
      color: COLORS.hot,
    },
    {
      name: "Warm Leads",
      value: outcomeDistribution.warm,
      color: COLORS.warm,
    },
    {
      name: "Not Interested",
      value: outcomeDistribution.notInterested,
      color: COLORS.notInterested,
    },
    {
      name: "No Reply",
      value: outcomeDistribution.noReply,
      color: COLORS.noReply,
    },
    {
      name: "Customer",
      value: outcomeDistribution.customer,
      color: COLORS.customer,
    },
  ].filter((item) => item.value > 0);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Lead Outcomes Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend/Stats */}
          <div className="flex flex-col justify-center space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Total Contacts</p>
              <p className="text-2xl font-bold">{total.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              {data.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{item.value.toLocaleString()}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      ({total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

