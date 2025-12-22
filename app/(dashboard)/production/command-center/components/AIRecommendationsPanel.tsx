"use client";

// Block 246000 — AI Recommendations Panel
// Shows AI-powered recommendations from OpsAI, DelayAI, ProfitRiskAI, RecommendationAI

import { Sparkles, ArrowRight, AlertTriangle, Package, DollarSign, Cloud, Calendar } from "lucide-react";

interface Recommendation {
  type: string;
  priority: string;
  title: string;
  message: string;
  action: {
    type: string;
    job_id?: string;
    [key: string]: any;
  };
  metadata?: any;
}

interface AIRecommendationsPanelProps {
  recommendations: Recommendation[];
}

export function AIRecommendationsPanel({ recommendations }: AIRecommendationsPanelProps) {
  if (recommendations.length === 0) {
    return null;
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-500/20 border-red-500/40";
      case "high":
        return "bg-orange-500/20 border-orange-500/40";
      case "warning":
        return "bg-yellow-500/20 border-yellow-500/40";
      default:
        return "bg-blue-500/20 border-blue-500/40";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "delay":
        return <AlertTriangle className="h-5 w-5 text-red-400" />;
      case "material":
        return <Package className="h-5 w-5 text-orange-400" />;
      case "profitability":
        return <DollarSign className="h-5 w-5 text-yellow-400" />;
      case "weather":
        return <Cloud className="h-5 w-5 text-blue-400" />;
      case "scheduling":
        return <Calendar className="h-5 w-5 text-purple-400" />;
      default:
        return <Sparkles className="h-5 w-5 text-blue-400" />;
    }
  };

  const handleAction = async (recommendation: Recommendation) => {
    // This would handle the recommended action
    console.log("Action recommended:", recommendation.action);
    // Could navigate to job, open modal, etc.
  };

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">AI Recommendations</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {recommendations.length} recommendations
        </div>
      </div>

      <div className="space-y-3">
        {recommendations.slice(0, 5).map((rec, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-3 ${getPriorityColor(rec.priority)} hover:border-opacity-60 transition-colors cursor-pointer`}
            onClick={() => handleAction(rec)}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getTypeIcon(rec.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white text-sm">{rec.title}</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-black/20 text-zinc-300 capitalize">
                    {rec.priority}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 mb-2">{rec.message}</p>
                <div className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                  <span>Take action</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

























