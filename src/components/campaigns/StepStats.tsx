"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type StepStats = {
  step_id: string;
  step_no: number;
  step_name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  spam: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
  spam_rate: number;
  delivery_rate: number;
};

type StepStatsProps = {
  campaignId: string;
  stepId?: string;
  stepNo?: number;
};

export function StepStats({ campaignId, stepId, stepNo }: StepStatsProps) {
  const [stats, setStats] = useState<StepStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        if (stepId) {
          const res = await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/stats`);
          if (res.ok) {
            const data = await res.json();
            setStats(data);
          }
        } else if (stepNo !== undefined) {
          // Fallback: get all stats and find the one matching step_no
          const res = await fetch(`/api/campaigns/${campaignId}/steps/stats`);
          if (res.ok) {
            const data = await res.json();
            const stepStat = data.steps?.find((s: StepStats) => s.step_no === stepNo);
            if (stepStat) {
              setStats(stepStat);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load step stats:", error);
      } finally {
        setLoading(false);
      }
    }

    if (campaignId && (stepId || stepNo !== undefined)) {
      loadStats();
    }
  }, [campaignId, stepId, stepNo]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">No stats available</div>
        </CardContent>
      </Card>
    );
  }

  const getHealthBadge = (metric: string, value: number) => {
    if (metric === "bounce_rate") {
      if (value > 4) return <Badge variant="destructive">Poor</Badge>;
      if (value > 2) return <Badge variant="outline" className="bg-yellow-50">Caution</Badge>;
      return <Badge variant="outline" className="bg-green-50">Excellent</Badge>;
    }
    if (metric === "spam_rate") {
      if (value > 0.2) return <Badge variant="destructive">Poor</Badge>;
      return <Badge variant="outline" className="bg-green-50">Excellent</Badge>;
    }
    if (metric === "open_rate") {
      if (value < 20) return <Badge variant="outline" className="bg-yellow-50">Caution</Badge>;
      if (value >= 30) return <Badge variant="outline" className="bg-green-50">Excellent</Badge>;
      return <Badge variant="outline">Good</Badge>;
    }
    if (metric === "reply_rate") {
      if (value < 0.3) return <Badge variant="outline" className="bg-yellow-50">Caution</Badge>;
      if (value >= 1.0) return <Badge variant="outline" className="bg-green-50">Excellent</Badge>;
      return <Badge variant="outline">Good</Badge>;
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {stats.step_name || `Step ${stats.step_no}`} — Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Sent</div>
            <div className="text-2xl font-bold">{stats.sent.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Delivered</div>
            <div className="text-2xl font-bold">{stats.delivered.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              ({stats.delivery_rate.toFixed(1)}%)
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Opened</div>
            <div className="text-2xl font-bold">{stats.opened.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              ({stats.open_rate.toFixed(1)}%)
              {getHealthBadge("open_rate", stats.open_rate)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Clicked</div>
            <div className="text-2xl font-bold">{stats.clicked.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              ({stats.click_rate.toFixed(1)}%)
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Replied</div>
            <div className="text-2xl font-bold">{stats.replied.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              ({stats.reply_rate.toFixed(2)}%)
              {getHealthBadge("reply_rate", stats.reply_rate)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Bounced</div>
            <div className="text-2xl font-bold">{stats.bounced.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              ({stats.bounce_rate.toFixed(2)}%)
              {getHealthBadge("bounce_rate", stats.bounce_rate)}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Spam</div>
            <div className="text-2xl font-bold">{stats.spam.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              ({stats.spam_rate.toFixed(2)}%)
              {getHealthBadge("spam_rate", stats.spam_rate)}
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-2">Key Metrics</div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Open Rate:</span>{" "}
              <span className="font-semibold">{stats.open_rate.toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Click Rate:</span>{" "}
              <span className="font-semibold">{stats.click_rate.toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Reply Rate:</span>{" "}
              <span className="font-semibold">{stats.reply_rate.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

