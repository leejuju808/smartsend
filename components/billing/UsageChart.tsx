"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

export function UsageChart({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/billing/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const json = await res.json();

        if (res.ok) {
          // Merge sends and replies by day
          const sendsMap = new Map(
            (json.sends || []).map((row: any) => [
              String(row.day),
              row.count || 0,
            ])
          );
          const repliesMap = new Map(
            (json.replies || []).map((row: any) => [
              String(row.day),
              row.count || 0,
            ])
          );

          // Generate all 7 days (last 7 days including today)
          const today = new Date();
          const days: string[] = [];
          for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            days.push(date.toISOString().split("T")[0]);
          }

          const merged = days.map((day) => ({
            day: new Date(day).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            sends: sendsMap.get(day) || 0,
            replies: repliesMap.get(day) || 0,
          }));

          setData(merged);
        }
      } catch (error) {
        console.error("Failed to load chart data:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>7-Day Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading chart...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>7-Day Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="sends"
                stroke="#facc15"
                name="Sends"
              />
              <Line
                type="monotone"
                dataKey="replies"
                stroke="#0ea5e9"
                name="Replies"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

