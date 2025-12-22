"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ReplyTrendData {
  date: string;
  count: number;
}

interface RevenueTrendData {
  date: string;
  value: number;
}

interface HotLeadsTrendData {
  week: string;
  count: number;
}

export function RepliesTrendChart({ data }: { data: ReplyTrendData[] }) {
  return (
    <div className="rounded-lg border-2 border-gray-200 p-6 bg-white">
      <h3 className="text-lg font-semibold mb-4">Replies Over Last 7 Days</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              labelFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
              }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: "#3b82f6", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: RevenueTrendData[] }) {
  // Format data for display (group by week for cleaner chart)
  const weeklyData = [];
  for (let i = 0; i < data.length; i += 7) {
    const weekData = data.slice(i, i + 7);
    const weekTotal = weekData.reduce((sum, d) => sum + d.value, 0);
    const weekLabel = weekData[0]?.date || "";
    weeklyData.push({
      week: `Week ${Math.floor(i / 7) + 1}`,
      value: Math.round(weekTotal),
      date: weekLabel,
    });
  }

  return (
    <div className="rounded-lg border-2 border-gray-200 p-6 bg-white">
      <h3 className="text-lg font-semibold mb-4">Revenue Trend (Last 30 Days)</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
                return `$${value}`;
              }}
            />
            <Tooltip
              formatter={(value: number) => {
                return new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(value);
              }}
            />
            <Bar dataKey="value" fill="#10b981" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HotLeadsTrendChart({ data }: { data: HotLeadsTrendData[] }) {
  return (
    <div className="rounded-lg border-2 border-gray-200 p-6 bg-white">
      <h3 className="text-lg font-semibold mb-4">Hot Leads Trend (Weekly)</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#f97316" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}





















































