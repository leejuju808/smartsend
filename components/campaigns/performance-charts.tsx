"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface DailyStat {
  day: string;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
  meetings: number;
}

interface PerformanceChartsProps {
  stats: DailyStat[];
}

export function PerformanceCharts({ stats }: PerformanceChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <LineChartCard title="Sends" dataKey="sends" data={stats} />
      <LineChartCard title="Opens" dataKey="opens" data={stats} />
      <LineChartCard title="Clicks" dataKey="clicks" data={stats} />
      <LineChartCard title="Replies" dataKey="replies" data={stats} />
      <LineChartCard title="Meetings" dataKey="meetings" data={stats} />
    </div>
  );
}

interface LineChartCardProps {
  title: string;
  dataKey: keyof DailyStat;
  data: DailyStat[];
}

function LineChartCard({ title, data, dataKey }: LineChartCardProps) {
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              try {
                return new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              } catch {
                return value;
              }
            }}
          />
          <YAxis allowDecimals={false} />
          <Tooltip
            labelFormatter={(value) => {
              try {
                return new Date(value).toLocaleDateString();
              } catch {
                return value;
              }
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="#FACC15"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}










