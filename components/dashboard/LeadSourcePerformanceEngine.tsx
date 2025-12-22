"use client";

import { useEffect, useState } from "react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, XCircle, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type LeadSourceStat = {
  id: string;
  workspace_id: string;
  source_name: string;
  total_leads: number;
  leads_won: number;
  revenue_won: number;
  avg_job_size: number;
  close_rate: number;
  avg_health: number;
  avg_momentum: number;
  avg_experience: number;
  avg_risk: number;
  ghosting_rate: number;
  dropoff_rate: number;
  avg_days_to_close: number;
  best_estimator_id: string | null;
  best_estimator_performance: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  updated_at: string;
  recommendations?: Recommendation[];
  routingRule?: RoutingRule;
};

type Recommendation = {
  id: string;
  recommendation_type: string;
  recommendation_text: string;
  priority: "low" | "medium" | "high" | "critical";
  supporting_data: Record<string, any>;
};

type RoutingRule = {
  id: string;
  routing_strategy: string;
  default_estimator_id: string | null;
};

export function LeadSourcePerformanceEngine() {
  const { workspace } = useCurrentWorkspace();
  const [stats, setStats] = useState<LeadSourceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);

  const fetchData = async () => {
    if (!workspace?.id) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/lead-source/performance?workspace_id=${workspace.id}`);
      const data = await res.json();
      setStats(data.stats || []);
    } catch (err) {
      console.error("Error fetching lead source performance:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [workspace?.id]);

  const triggerGrading = async () => {
    if (!workspace?.id) return;

    setGrading(true);
    try {
      const res = await fetch("/api/lead-source/performance/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspace.id }),
      });

      if (res.ok) {
        // Refresh data after grading
        await fetchData();
      }
    } catch (err) {
      console.error("Error triggering grading:", err);
    } finally {
      setGrading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Lead Source Performance Engine</h2>
            <p className="text-sm text-gray-500 mt-1">
              Automatically ranks, grades, and routes every lead source based on actual revenue, quality, tone, momentum, risk, and win-rate
            </p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500">Loading source performance data...</p>
        </div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Lead Source Performance Engine</h2>
            <p className="text-sm text-gray-500 mt-1">
              Automatically ranks, grades, and routes every lead source based on actual revenue, quality, tone, momentum, risk, and win-rate
            </p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">
            No lead source data yet. Sources will be automatically detected as leads come in.
          </p>
          <Button onClick={triggerGrading} disabled={grading}>
            {grading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Grading Sources...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Calculate Grades
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Sort by grade priority, then revenue
  const sortedStats = [...stats].sort((a, b) => {
    const gradeOrder = { "A+": 6, "A": 5, "B": 4, "C": 3, "D": 2, "F": 1 };
    const gradeDiff = (gradeOrder[b.grade] || 0) - (gradeOrder[a.grade] || 0);
    if (gradeDiff !== 0) return gradeDiff;
    return (b.revenue_won || 0) - (a.revenue_won || 0);
  });

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lead Source Performance Engine</h2>
          <p className="text-sm text-gray-500 mt-1">
            Automatically ranks, grades, and routes every lead source based on actual revenue, quality, tone, momentum, risk, and win-rate
          </p>
        </div>
        <Button onClick={triggerGrading} disabled={grading} variant="outline" size="sm">
          {grading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Grading...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Grades
            </>
          )}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Lead Source</th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Grade</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Close Rate</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Avg Job Size</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Ghosting</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Momentum</th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Revenue</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat) => (
              <SourceRow key={stat.id} stat={stat} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceRow({ stat }: { stat: LeadSourceStat }) {
  const gradeColors = {
    "A+": "bg-green-100 text-green-800 border-green-300",
    "A": "bg-green-50 text-green-700 border-green-200",
    "B": "bg-blue-50 text-blue-700 border-blue-200",
    "C": "bg-yellow-50 text-yellow-700 border-yellow-200",
    "D": "bg-orange-50 text-orange-700 border-orange-200",
    "F": "bg-red-50 text-red-700 border-red-200",
  };

  const recommendation = stat.recommendations?.[0];

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-4 px-4">
        <div className="font-medium text-gray-900">{formatSourceName(stat.source_name)}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          {stat.total_leads} leads • {stat.leads_won} won
        </div>
      </td>
      <td className="py-4 px-4 text-center">
        <span
          className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border",
            gradeColors[stat.grade]
          )}
        >
          {stat.grade}
        </span>
      </td>
      <td className="py-4 px-4 text-right">
        <div className="font-semibold text-gray-900">{stat.close_rate.toFixed(1)}%</div>
        <div className="text-xs text-gray-500">
          {stat.avg_days_to_close > 0 ? `${stat.avg_days_to_close.toFixed(1)} days avg` : "—"}
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <div className="font-semibold text-gray-900">
          ${Math.round(stat.avg_job_size).toLocaleString()}
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <div className={cn(
          "text-sm font-medium",
          stat.ghosting_rate >= 40 ? "text-red-600" : stat.ghosting_rate >= 20 ? "text-orange-600" : "text-gray-600"
        )}>
          {stat.ghosting_rate.toFixed(1)}%
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="text-sm font-medium text-gray-900">{Math.round(stat.avg_momentum)}</span>
          {stat.avg_momentum >= 70 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : stat.avg_momentum < 40 ? (
            <TrendingDown className="h-4 w-4 text-red-500" />
          ) : (
            <Minus className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <div className="font-bold text-gray-900">
          ${Math.round(stat.revenue_won).toLocaleString()}
        </div>
      </td>
      <td className="py-4 px-4">
        {recommendation ? (
          <div className="flex items-start gap-2">
            {recommendation.priority === "critical" && (
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            )}
            {recommendation.priority === "high" && (
              <ArrowUp className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
            )}
            {recommendation.priority === "low" && (
              <ArrowDown className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            )}
            {recommendation.priority === "medium" && (
              <Minus className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            )}
            <div className="text-xs text-gray-700">
              {getRecommendationIcon(recommendation.recommendation_type)}{" "}
              {recommendation.recommendation_text}
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}

function formatSourceName(source: string): string {
  const sourceMap: Record<string, string> = {
    Website: "Website",
    Facebook: "Facebook",
    "Google Ads": "Google Ads",
    LSA: "Google Local Services",
    "HomeAdvisor / Angi": "HomeAdvisor / Angi",
    Referrals: "Referrals",
    "Yard Sign": "Yard Sign",
    "Storm Campaign": "Storm Campaign",
    Canvassing: "Canvassing",
    "Solar Cross-Lead": "Solar Cross-Lead",
    "Insurance Agent referral": "Insurance Agent Referral",
    "Third-party lead buyers": "Third-Party Lead Buyers",
    "TikTok organic": "TikTok Organic",
    "YouTube organic": "YouTube Organic",
    "Cold Email responses": "Cold Email Responses",
    Other: "Other",
    Unknown: "Unknown",
  };

  return sourceMap[source] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function getRecommendationIcon(type: string): string {
  const icons: Record<string, string> = {
    increase_budget: "⬆",
    decrease_budget: "⬇",
    stop_buying: "❌",
    move_spend: "➡",
    change_routing: "🔄",
    optimize_followup: "⚡",
    improve_quality: "✨",
  };
  return icons[type] || "💡";
}









































