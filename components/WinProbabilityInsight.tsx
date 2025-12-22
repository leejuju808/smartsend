// Block 22192 — SmartSend Roofing Win Probability Engine v1
// WinProbabilityInsight: Expanded probability insight panel for job detail pages
// Shows:
// - current probability
// - trend over time
// - top 3 reasons for score
// - recommended next action (auto linked)
// - actions that would increase probability

"use client";

import React, { useState, useEffect } from "react";
import { WinProbabilityBadge } from "./WinProbabilityBadge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Lightbulb, Target, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface WinProbabilityInsightProps {
  leadId: string;
  probability: number | null;
  reason: string | null;
  updatedAt: string | null;
  nextAction?: string | null;
  nextActionReason?: string | null;
  className?: string;
  onRecalculate?: () => void;
}

interface ProbabilityHistory {
  probability: number;
  updated_at: string;
}

export function WinProbabilityInsight({
  leadId,
  probability,
  reason,
  updatedAt,
  nextAction,
  nextActionReason,
  className,
  onRecalculate,
}: WinProbabilityInsightProps) {
  const [history, setHistory] = useState<ProbabilityHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [trend, setTrend] = useState<"improving" | "declining" | "stable">("stable");

  // Fetch probability history from timeline
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/jobs/${leadId}/probability-history`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data.history || []);
          
          // Calculate trend
          if (data.history && data.history.length >= 2) {
            const latest = data.history[0].probability;
            const previous = data.history[data.history.length - 1].probability;
            const diff = latest - previous;
            
            if (diff > 5) {
              setTrend("improving");
            } else if (diff < -5) {
              setTrend("declining");
            } else {
              setTrend("stable");
            }
          }
        }
      } catch (error) {
        console.error("Error fetching probability history:", error);
      }
    };

    if (leadId) {
      fetchHistory();
    }
  }, [leadId, probability]);

  const handleRecalculate = async () => {
    if (loading) return;
    setLoading(true);
    
    try {
      const response = await fetch("/api/edge/calculate-win-probability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      
      if (response.ok) {
        if (onRecalculate) {
          onRecalculate();
        }
        // Refresh history after recalculation
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error("Error recalculating probability:", error);
    } finally {
      setLoading(false);
    }
  };

  // Parse reason into top 3 reasons
  const parseReasons = (reasonText: string | null): string[] => {
    if (!reasonText) return [];
    
    // Try to split by common separators
    const reasons = reasonText
      .split(/[.;]\s*/)
      .filter((r) => r.trim().length > 0)
      .slice(0, 3)
      .map((r) => r.trim());
    
    return reasons.length > 0 ? reasons : [reasonText];
  };

  const reasons = parseReasons(reason);

  // Get trend icon
  const getTrendIcon = () => {
    switch (trend) {
      case "improving":
        return <TrendingUp className="h-4 w-4 text-green-400" />;
      case "declining":
        return <TrendingDown className="h-4 w-4 text-red-400" />;
      default:
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTrendText = () => {
    if (!history.length || history.length < 2) return "No trend data";
    
    const latest = history[0].probability;
    const previous = history[history.length - 1].probability;
    const diff = latest - previous;
    
    if (diff > 0) {
      return `+${diff}%`;
    } else if (diff < 0) {
      return `${diff}%`;
    }
    return "Stable";
  };

  // Actions that would increase probability
  const getIncreaseActions = (): string[] => {
    const actions: string[] = [];
    
    if (!probability || probability < 70) {
      if (nextAction) {
        actions.push(`Complete: ${nextAction.replace(/_/g, " ")}`);
      }
      actions.push("Send proposal today");
      actions.push("Confirm timeline with homeowner");
      actions.push("Schedule inspection if not done");
    }
    
    return actions;
  };

  const increaseActions = getIncreaseActions();

  return (
    <div className={cn("rounded-2xl border border-zinc-800 bg-zinc-950 p-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 mb-2">
            Win Probability
          </h3>
          <div className="flex items-center gap-3">
            <WinProbabilityBadge
              probability={probability}
              variant="glow"
              showLabel={true}
            />
            {history.length >= 2 && (
              <div className="flex items-center gap-1 text-sm">
                {getTrendIcon()}
                <span
                  className={cn(
                    trend === "improving"
                      ? "text-green-400"
                      : trend === "declining"
                      ? "text-red-400"
                      : "text-gray-400"
                  )}
                >
                  {getTrendText()}
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={loading}
          className="p-2 hover:bg-white/10 rounded-lg transition disabled:opacity-50"
          title="Recalculate probability"
        >
          <RefreshCw className={cn("h-4 w-4 text-gray-400", loading && "animate-spin")} />
        </button>
      </div>

      {/* Last Updated */}
      {updatedAt && (
        <p className="text-xs text-zinc-500 mb-4">
          Last updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
        </p>
      )}

      {/* Top 3 Reasons */}
      {reasons.length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-zinc-400 mb-3 flex items-center gap-2">
            <Lightbulb className="h-3 w-3" />
            Top Reasons for This Score
          </h4>
          <ul className="space-y-2">
            {reasons.map((r, idx) => (
              <li key={idx} className="text-sm text-zinc-300 flex items-start gap-2">
                <span className="text-zinc-500 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Next Action */}
      {nextAction && nextActionReason && (
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h4 className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-2">
            <Target className="h-3 w-3" />
            Recommended Next Action
          </h4>
          <p className="text-sm text-zinc-300 mb-1 font-medium capitalize">
            {nextAction.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-zinc-400">{nextActionReason}</p>
        </div>
      )}

      {/* Actions to Increase Probability */}
      {increaseActions.length > 0 && probability !== null && probability < 100 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 mb-3">
            To Increase Probability
          </h4>
          <ul className="space-y-2">
            {increaseActions.map((action, idx) => (
              <li key={idx} className="text-sm text-zinc-300 flex items-start gap-2">
                <span className="text-green-400 mt-0.5">✓</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Probability History Chart (Simple) */}
      {history.length > 1 && (
        <div className="mt-6 pt-6 border-t border-zinc-800">
          <h4 className="text-xs font-semibold text-zinc-400 mb-3">
            Probability Trend
          </h4>
          <div className="flex items-end gap-1 h-20">
            {history.slice(0, 7).reverse().map((h, idx) => {
              const height = (h.probability / 100) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 bg-blue-500/30 rounded-t transition-all hover:bg-blue-500/50"
                  style={{ height: `${height}%` }}
                  title={`${h.probability}% - ${formatDistanceToNow(new Date(h.updated_at), { addSuffix: true })}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}









































