// Block 22210 — SmartSend Roofing Loss Reason Detector v1
// Top Loss Reasons Widget: Shows top 5 loss reasons this month

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingDown } from "lucide-react";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

interface LossReasonStat {
  loss_reason: string;
  count: number;
  percentage: number;
  avg_confidence: number;
  total_lost_value: number;
}

export function TopLossReasonsWidget() {
  const [data, setData] = useState<LossReasonStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    getActiveWorkspaceId().then(setWorkspaceId);
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/analytics/top-loss-reasons?workspace_id=${workspaceId}&limit=5`
        );
        
        if (response.ok) {
          const result = await response.json();
          setData(result.data || []);
        } else {
          console.error("Failed to fetch loss reasons");
        }
      } catch (error) {
        console.error("Error fetching loss reasons:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Top 5 Loss Reasons This Month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-lg font-semibold">Top 5 Loss Reasons This Month</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No loss data available for this month.
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalLost = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-red-500" />
          <CardTitle className="text-lg font-semibold">Top 5 Loss Reasons This Month</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {totalLost} total lost jobs analyzed
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-muted-foreground border-b pb-2">
            <div className="col-span-2">Loss Reason</div>
            <div className="text-right">Count</div>
            <div className="text-right">Percent</div>
            <div className="text-right">Lost Value</div>
          </div>
          
          {data.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-5 gap-2 text-sm items-center hover:bg-muted/50 p-1 rounded"
            >
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-red-500">❌</span>
                <span className="font-medium">{item.loss_reason}</span>
              </div>
              <div className="text-right font-semibold">{item.count}</div>
              <div className="text-right text-muted-foreground">
                {item.percentage.toFixed(0)}%
              </div>
              <div className="text-right text-red-600 font-semibold">
                ${item.total_lost_value > 0 
                  ? (item.total_lost_value / 1000).toFixed(0) + "k"
                  : "—"}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            💡 <strong>Insight:</strong> Addressing the top loss reason could save{" "}
            <span className="font-semibold text-red-600">
              ${data[0]?.total_lost_value > 0 
                ? (data[0].total_lost_value / 1000).toFixed(0) + "k"
                : "significant revenue"}
            </span>{" "}
            per month.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}









































