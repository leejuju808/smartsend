// Block 21977 — SmartSend Roofing Win/Loss Reasons Report Component
// Shows Top 10 Win/Loss Reasons for Owners & Estimators

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/Card";

interface ReasonData {
  reason_type: "win" | "loss";
  reason: string;
  count: number;
  percentage: number;
  avg_confidence: number;
  total_value: number;
}

interface WinLossReasonsReportProps {
  workspaceId: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export function WinLossReasonsReport({
  workspaceId,
  startDate,
  endDate,
  limit = 10,
}: WinLossReasonsReportProps) {
  const [winReasons, setWinReasons] = useState<ReasonData[]>([]);
  const [lossReasons, setLossReasons] = useState<ReasonData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReasons = async () => {
      if (!workspaceId) return;

      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();

        const { data, error: rpcError } = await supabase.rpc("get_top_win_loss_reasons", {
          p_workspace_id: workspaceId,
          p_start_date: startDate?.toISOString() || null,
          p_end_date: endDate?.toISOString() || null,
          p_limit: limit,
        });

        if (rpcError) {
          console.error("RPC error:", rpcError);
          setError(rpcError.message);
          return;
        }

        if (data) {
          const wins = data.filter((r: ReasonData) => r.reason_type === "win");
          const losses = data.filter((r: ReasonData) => r.reason_type === "loss");
          setWinReasons(wins);
          setLossReasons(losses);
        }
      } catch (err) {
        console.error("Error loading win/loss reasons:", err);
        setError(err instanceof Error ? err.message : "Failed to load reasons");
      } finally {
        setLoading(false);
      }
    };

    loadReasons();
  }, [workspaceId, startDate, endDate, limit]);

  if (loading) {
    return (
      <div className="text-sm text-gray-500">Loading win/loss reasons...</div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">Error: {error}</div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Win Reasons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-green-700">
            ✔ Top {winReasons.length} Win Reasons
          </CardTitle>
        </CardHeader>
        <CardContent>
          {winReasons.length === 0 ? (
            <div className="text-sm text-gray-500 py-4">
              No win reasons available yet
            </div>
          ) : (
            <div className="space-y-3">
              {winReasons.map((reason, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-4 p-3 rounded-lg bg-green-50 border border-green-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-green-800">
                        {reason.percentage.toFixed(0)}%
                      </span>
                      <span className="text-xs text-gray-600">
                        ({reason.count} {reason.count === 1 ? "job" : "jobs"})
                      </span>
                    </div>
                    <div className="text-sm text-gray-700">{reason.reason}</div>
                    {reason.avg_confidence > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Avg confidence: {reason.avg_confidence.toFixed(0)}%
                      </div>
                    )}
                  </div>
                  {reason.total_value > 0 && (
                    <div className="text-sm font-semibold text-green-700 whitespace-nowrap">
                      ${reason.total_value.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loss Reasons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-red-700">
            ❌ Top {lossReasons.length} Loss Reasons
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lossReasons.length === 0 ? (
            <div className="text-sm text-gray-500 py-4">
              No loss reasons available yet
            </div>
          ) : (
            <div className="space-y-3">
              {lossReasons.map((reason, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-4 p-3 rounded-lg bg-red-50 border border-red-200"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-red-800">
                        {reason.percentage.toFixed(0)}%
                      </span>
                      <span className="text-xs text-gray-600">
                        ({reason.count} {reason.count === 1 ? "job" : "jobs"})
                      </span>
                    </div>
                    <div className="text-sm text-gray-700">{reason.reason}</div>
                    {reason.avg_confidence > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Avg confidence: {reason.avg_confidence.toFixed(0)}%
                      </div>
                    )}
                  </div>
                  {reason.total_value > 0 && (
                    <div className="text-sm font-semibold text-red-700 whitespace-nowrap">
                      ${reason.total_value.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

