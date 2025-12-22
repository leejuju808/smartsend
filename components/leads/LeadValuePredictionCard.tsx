// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// Lead Value Prediction Card Component

"use client";

import { useEffect, useState } from "react";
import { TrendingUp, DollarSign, Target, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LeadValuePrediction {
  id: string;
  lead_id: string;
  predicted_job_value: number;
  predicted_job_value_min: number;
  predicted_job_value_max: number;
  close_probability: number;
  profit_score: number;
  recommended_priority: "High" | "Medium" | "Low";
  reasoning: string;
  created_at: string;
}

interface LeadValuePredictionCardProps {
  leadId: string;
  workspaceId?: string;
  className?: string;
}

export function LeadValuePredictionCard({
  leadId,
  workspaceId,
  className = "",
}: LeadValuePredictionCardProps) {
  const [prediction, setPrediction] = useState<LeadValuePrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchPrediction() {
    if (!leadId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/leads/predict-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, workspace_id: workspaceId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch prediction: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.prediction) {
        setPrediction(data.prediction);
      }
    } catch (err) {
      console.error("Error fetching prediction:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch prediction");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshPrediction() {
    setRefreshing(true);
    await fetchPrediction();
  }

  useEffect(() => {
    fetchPrediction();
  }, [leadId]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "Low":
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  const getProfitScoreColor = (score: number) => {
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-yellow-400";
    return "text-gray-400";
  };

  const getCloseProbabilityColor = (prob: number) => {
    if (prob >= 0.7) return "text-green-400";
    if (prob >= 0.5) return "text-yellow-400";
    return "text-gray-400";
  };

  if (loading && !prediction) {
    return (
      <div className={`p-4 rounded-xl bg-white/5 border border-white/10 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Job Value Predictor</h3>
        </div>
        <div className="space-y-3">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-white/10 rounded w-3/4"></div>
            <div className="h-4 bg-white/10 rounded w-1/2"></div>
            <div className="h-4 bg-white/10 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !prediction) {
    return (
      <div className={`p-4 rounded-xl bg-white/5 border border-red-500/30 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Job Value Predictor</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchPrediction}
            className="text-xs"
          >
            Retry
          </Button>
        </div>
        <div className="text-sm text-red-400">{error}</div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className={`p-4 rounded-xl bg-white/5 border border-white/10 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Job Value Predictor</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchPrediction}
            disabled={loading}
            className="text-xs"
          >
            {loading ? "Loading..." : "Generate Prediction"}
          </Button>
        </div>
        <p className="text-sm text-gray-400">
          Click "Generate Prediction" to see AI-powered job value and profit probability.
        </p>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl bg-white/5 border border-white/10 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Target className="w-5 h-5" />
          Job Value Predictor
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshPrediction}
          disabled={refreshing}
          className="text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Priority Badge */}
      <div className="flex items-center gap-2">
        <Badge className={getPriorityColor(prediction.recommended_priority)}>
          {prediction.recommended_priority} Priority
        </Badge>
        <span className="text-xs text-gray-400">
          Updated {new Date(prediction.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Predicted Job Value */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase">Job Value</span>
          </div>
          <div className="text-2xl font-bold text-white">
            ${Math.round(prediction.predicted_job_value).toLocaleString()}
          </div>
          {prediction.predicted_job_value_min && prediction.predicted_job_value_max && (
            <div className="text-xs text-gray-400 mt-1">
              Range: ${Math.round(prediction.predicted_job_value_min).toLocaleString()} - ${Math.round(prediction.predicted_job_value_max).toLocaleString()}
            </div>
          )}
        </div>

        {/* Close Probability */}
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase">Close Probability</span>
          </div>
          <div className={`text-2xl font-bold ${getCloseProbabilityColor(prediction.close_probability)}`}>
            {Math.round(prediction.close_probability * 100)}%
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {prediction.close_probability >= 0.7 ? "High" : prediction.close_probability >= 0.5 ? "Medium" : "Low"}
          </div>
        </div>
      </div>

      {/* Profit Score - THE MASTER METRIC */}
      <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold text-gray-300">Profit Score™</span>
          </div>
          <span className={`text-3xl font-bold ${getProfitScoreColor(prediction.profit_score)}`}>
            {Math.round(prediction.profit_score)}/100
          </span>
        </div>
        <p className="text-xs text-gray-400">
          Master metric combining job value, close probability, and difficulty
        </p>
      </div>

      {/* Reasoning */}
      {prediction.reasoning && (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-gray-300 uppercase">AI Reasoning</span>
          </div>
          <p className="text-sm text-gray-200 leading-relaxed">{prediction.reasoning}</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="pt-2 border-t border-white/10">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Use this data to prioritize your day</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshPrediction}
            disabled={refreshing}
            className="text-xs h-6"
          >
            {refreshing ? "Refreshing..." : "Recalculate"}
          </Button>
        </div>
      </div>
    </div>
  );
}



























