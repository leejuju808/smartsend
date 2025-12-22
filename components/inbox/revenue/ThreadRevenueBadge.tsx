"use client";

import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";

interface ThreadRevenueBadgeProps {
  estimatedValue: number | null;
  probabilityScore: number | null;
  pipelineStage?: string;
}

export function ThreadRevenueBadge({
  estimatedValue,
  probabilityScore,
  pipelineStage,
}: ThreadRevenueBadgeProps) {
  if (!estimatedValue) {
    return null;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getProbabilityColor = (score: number | null) => {
    if (!score) return "text-gray-500";
    if (score >= 70) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-orange-600";
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs">
        <DollarSign className="w-3 h-3 mr-1" />
        {formatCurrency(estimatedValue)}
      </Badge>
      {probabilityScore !== null && (
        <span className={`text-xs font-medium ${getProbabilityColor(probabilityScore)}`}>
          {probabilityScore}%
        </span>
      )}
      {pipelineStage && (
        <Badge variant="secondary" className="text-xs">
          {pipelineStage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
        </Badge>
      )}
    </div>
  );
}



















































