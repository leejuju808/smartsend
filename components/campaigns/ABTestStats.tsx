"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, BarChart3 } from "lucide-react";

interface ABTestStats {
  step_id: string;
  step_no: number;
  variant_a: {
    sent: number;
    opened: number;
    rate: number;
  };
  variant_b: {
    sent: number;
    opened: number;
    rate: number;
  };
  winner: string | null;
  improvement_pct: number | null;
}

interface ABTestStatsProps {
  campaignId: string;
  stepId: string;
  stepNo: number;
}

export function ABTestStats({ campaignId, stepId, stepNo }: ABTestStatsProps) {
  const [stats, setStats] = useState<ABTestStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch(
          `/api/campaigns/${campaignId}/ab-test/stats?step_id=${stepId}&step_no=${stepNo}`
        );
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch A/B test stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [campaignId, stepId, stepNo]);

  if (loading) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading A/B test stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || (stats.variant_a.sent === 0 && stats.variant_b.sent === 0)) {
    return null;
  }

  const totalSent = stats.variant_a.sent + stats.variant_b.sent;
  const isInsufficient = totalSent < 100;

  return (
    <Card className="mt-4 border-green-200 bg-green-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            A/B Test Performance
          </CardTitle>
          {stats.winner && (
            <Badge variant="default" className="bg-green-600">
              <TrendingUp className="w-3 h-3 mr-1" />
              Winner: Variant {stats.winner}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-lg border ${stats.winner === "A" ? "border-green-500 bg-green-100" : "border-gray-200 bg-white"}`}>
            <div className="text-xs font-semibold text-muted-foreground mb-1">Variant A</div>
            <div className="text-lg font-bold">{stats.variant_a.sent} sent</div>
            <div className="text-sm text-muted-foreground">
              {stats.variant_a.opened} opened ({stats.variant_a.rate.toFixed(1)}%)
            </div>
          </div>
          <div className={`p-3 rounded-lg border ${stats.winner === "B" ? "border-green-500 bg-green-100" : "border-gray-200 bg-white"}`}>
            <div className="text-xs font-semibold text-muted-foreground mb-1">Variant B</div>
            <div className="text-lg font-bold">{stats.variant_b.sent} sent</div>
            <div className="text-sm text-muted-foreground">
              {stats.variant_b.opened} opened ({stats.variant_b.rate.toFixed(1)}%)
            </div>
          </div>
        </div>

        {stats.winner && stats.improvement_pct && (
          <div className="text-xs text-green-700 font-medium pt-2 border-t">
            Variant {stats.winner} is outperforming by +{stats.improvement_pct.toFixed(1)}%
            <br />
            <span className="text-muted-foreground">
              SmartSend will now use Variant {stats.winner} for the rest of this sequence.
            </span>
          </div>
        )}

        {isInsufficient && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Need at least 100 total sends to determine winner ({totalSent}/100)
          </div>
        )}
      </CardContent>
    </Card>
  );
}



























































