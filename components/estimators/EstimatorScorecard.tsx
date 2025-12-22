"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EstimatorPerformanceData = {
  id: string;
  workspace_id: string;
  estimator_id: string;
  performance_score: number;
  speed_score: number;
  followup_score: number;
  proposal_score: number;
  close_rate_score: number;
  tone_score: number;
  ai_alignment_score: number;
  calculated_at: string;
};

type EstimatorScoreCardProps = {
  score: EstimatorPerformanceData;
  estimatorName?: string;
  className?: string;
};

export function EstimatorScoreCard({
  score,
  estimatorName,
  className,
}: EstimatorScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-blue-600 bg-blue-50 border-blue-200";
    if (score >= 40) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getScoreBadgeVariant = (
    score: number
  ): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    if (score >= 40) return "outline";
    return "destructive";
  };

  const getPerformanceLabel = (score: number): string => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Great";
    if (score >= 70) return "Good";
    if (score >= 60) return "Fair";
    if (score >= 40) return "Needs Improvement";
    return "Poor";
  };

  return (
    <Card className={cn("p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {estimatorName ? `${estimatorName}'s Performance` : "Estimator Performance"}
        </h3>
        <Badge
          variant={getScoreBadgeVariant(score.performance_score)}
          className="text-2xl font-bold px-4 py-2"
        >
          {score.performance_score}
        </Badge>
      </div>

      {/* Performance Label */}
      <div className="text-sm text-muted-foreground">
        {getPerformanceLabel(score.performance_score)}
      </div>

      {/* Main Score Display */}
      <div className="text-4xl font-bold text-center py-2">
        {score.performance_score}
      </div>

      {/* 6 Signals Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Metric
          label="Speed to Lead"
          value={score.speed_score}
          weight="25%"
        />
        <Metric
          label="Follow-Up Rate"
          value={score.followup_score}
          weight="25%"
        />
        <Metric
          label="Proposal Speed"
          value={score.proposal_score}
          weight="15%"
        />
        <Metric
          label="Close Rate"
          value={score.close_rate_score}
          weight="20%"
        />
        <Metric
          label="Tone Impact"
          value={score.tone_score}
          weight="10%"
        />
        <Metric
          label="AI Alignment"
          value={score.ai_alignment_score}
          weight="5%"
        />
      </div>

      {/* Last Calculated */}
      <div className="text-xs text-muted-foreground pt-2 border-t border-white/10">
        Last calculated: {new Date(score.calculated_at).toLocaleString()}
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight?: string;
}) {
  const getValueColor = (value: number) => {
    if (value >= 80) return "text-green-600";
    if (value >= 60) return "text-blue-600";
    if (value >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-400 text-xs">{label}</span>
        {weight && (
          <span className="text-gray-500 text-[10px]">{weight}</span>
        )}
      </div>
      <span className={cn("text-lg font-semibold", getValueColor(value))}>
        {value}
      </span>
    </div>
  );
}








































