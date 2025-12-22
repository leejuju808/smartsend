"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

type CashflowForecastData = {
  timeline: Record<
    string,
    {
      incoming: number;
      outgoing: number;
      net: number;
      cumulative?: number;
    }
 >;
  summary: {
    total_incoming: number;
    total_outgoing: number;
    total_net: number;
    min_daily_net: number;
    min_cumulative_balance: number;
    red_flag_days_count: number;
  };
  red_flag_days: Array<{
    day: string;
    net: number;
    incoming: number;
    outgoing: number;
  }>;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function CashflowForecastChart({
  data,
  showCumulative = false,
}: {
  data: CashflowForecastData;
  showCumulative?: boolean;
}) {
  if (!data || !data.timeline || Object.keys(data.timeline).length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground border rounded-lg">
        <p>No cashflow forecast data available</p>
      </div>
    );
  }

  // Transform timeline data for chart
  const chartData = Object.entries(data.timeline)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date: formatDate(date),
      dateKey: date,
      incoming: values.incoming,
      outgoing: values.outgoing,
      net: values.net,
      cumulative: values.cumulative || 0,
    }));

  // Sample dates for X-axis (show every Nth date to avoid crowding)
  const sampleInterval = Math.max(1, Math.floor(chartData.length / 10));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            fontSize={11}
            tick={{ fill: "#6b7280" }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={sampleInterval}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tick={{ fill: "#6b7280" }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === "net"
                ? "Net Cashflow"
                : name === "incoming"
                  ? "Incoming"
                  : name === "outgoing"
                    ? "Outgoing"
                    : name === "cumulative"
                      ? "Cumulative Balance"
                      : name,
            ]}
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f9fafb",
            }}
            labelStyle={{ color: "#f9fafb" }}
          />
          <Legend />
          {/* Zero line */}
          <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 2" />
          {/* Incoming line */}
          <Line
            type="monotone"
            dataKey="incoming"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="Incoming"
          />
          {/* Outgoing line */}
          <Line
            type="monotone"
            dataKey="outgoing"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            name="Outgoing"
          />
          {/* Net cashflow line */}
          <Line
            type="monotone"
            dataKey="net"
            stroke="#3b82f6"
            strokeWidth={3}
            dot={{ fill: "#3b82f6", r: 3 }}
            activeDot={{ r: 5 }}
            name="Net Cashflow"
          />
          {/* Cumulative balance line (optional) */}
          {showCumulative && (
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Cumulative Balance"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}



































