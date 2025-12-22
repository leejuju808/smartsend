"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function BillingMetrics({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/billing/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const json = await res.json();
        if (res.ok) {
          setData(json);
        }
      } catch (error) {
        console.error("Failed to load metrics:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId]);

  if (loading) {
    return <div className="text-sm text-gray-500">Loading metrics...</div>;
  }

  if (!data) {
    return <div className="text-sm text-red-600">Error loading metrics</div>;
  }

  const m = data.metrics;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>7-Day Sends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{m.sends_7d}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>30-Day Sends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{m.sends_30d}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projected 30-Day Sends</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.sends_forecast_30d}</div>
          <div className="text-sm text-gray-500 mt-1">Based on 7-day average</div>
        </CardContent>
      </Card>
    </div>
  );
}








