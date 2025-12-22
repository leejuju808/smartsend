// components/dashboard/workspace-summary-with-range.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type RangeKey = "7d" | "30d" | "90d" | "all";

type Summary = {
  total_sent: number;
  total_delivered: number;
  unique_opens: number;
  unique_clicks: number;
  unique_replies: number;
  total_bounces: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
};

type Props = {
  workspaceId: string;
};

export function WorkspaceSummaryWithRange({ workspaceId }: Props) {
  const [range, setRange] = React.useState<RangeKey>("30d");
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState<Summary | null>(null);

  const loadSummary = React.useCallback(
    async (r: RangeKey) => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/workspace-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, range: r }),
        });

        const data = await res.json();

        if (!res.ok) {
          console.error("summary error", data);
          setSummary(null);
        } else {
          setSummary({
            total_sent: data.total_sent ?? 0,
            total_delivered: data.total_delivered ?? 0,
            unique_opens: data.unique_opens ?? 0,
            unique_clicks: data.unique_clicks ?? 0,
            unique_replies: data.unique_replies ?? 0,
            total_bounces: data.total_bounces ?? 0,
            open_rate: data.open_rate ?? 0,
            click_rate: data.click_rate ?? 0,
            reply_rate: data.reply_rate ?? 0,
          });
        }
      } catch (err) {
        console.error("summary fetch error", err);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  React.useEffect(() => {
    loadSummary(range);
  }, [range, loadSummary]);

  const pct = (x: number) => `${Math.round((x || 0) * 100)}%`;

  const labelForRange: Record<RangeKey, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
    all: "All time",
  };

  const s = summary || {
    total_sent: 0,
    total_delivered: 0,
    unique_opens: 0,
    unique_clicks: 0,
    unique_replies: 0,
    total_bounces: 0,
    open_rate: 0,
    click_rate: 0,
    reply_rate: 0,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">
            {labelForRange[range]} performance
          </span>
          <span className="text-xs text-muted-foreground">
            Aggregated across all campaigns in this workspace.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={range}
            onValueChange={(val) => setRange(val as RangeKey)}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => loadSummary(range)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="text-xs">↻</span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {s.total_sent}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Delivered: {s.total_delivered} • Bounced: {s.total_bounces}
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Open Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {pct(s.open_rate)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Unique opens: {s.unique_opens}
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Click Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {pct(s.click_rate)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Unique clicks: {s.unique_clicks}
            </p>
          </CardContent>
        </Card>

        <Card className="border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Reply Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {pct(s.reply_rate)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Unique replies: {s.unique_replies}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
































































