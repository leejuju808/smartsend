"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function WeeklyWins() {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchWins = async () => {
      try {
        const res = await fetch("/api/owner/weekly-wins");
        const json = await res.json();
        setData(json.data ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchWins();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>This Week's Wins</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader><CardTitle>This Week's Wins</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          No wins to show yet. Once SmartSend starts generating leads and bookings,
          your weekly highlights will appear here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-emerald-500/30">
      <CardHeader>
        <CardTitle>This Week's Wins 🎉</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p><strong>🔥 Hot leads:</strong> {data.hot_leads}</p>
        <p><strong>🟡 Warm leads:</strong> {data.warm_leads}</p>
        <p><strong>📅 Jobs booked:</strong> {data.jobs_booked}</p>
        <p><strong>💰 Value booked:</strong> ${Math.round(data.booked_value).toLocaleString()}</p>
        <p><strong>🏆 Biggest job:</strong> ${Math.round(data.biggest_job_value).toLocaleString()}</p>

        <p className="text-[10px] text-muted-foreground mt-2">
          SmartSend highlights your weekly momentum so you can see progress at a glance.
        </p>
      </CardContent>
    </Card>
  );
}

