// components/ui/PipelineStageBadge.tsx
// Block 21555 — Pipeline Stage Badge Component
// Displays pipeline stages with appropriate colors

import React from "react";

export type PipelineStage =
  | "new"
  | "contacted"
  | "replied"
  | "interested"
  | "estimate_scheduled"
  | "estimate_completed"
  | "verbal_yes"
  | "contract_sent"
  | "won"
  | "lost";

interface PipelineStageBadgeProps {
  stage: PipelineStage | string | null | undefined;
  className?: string;
}

export function PipelineStageBadge({ stage, className = "" }: PipelineStageBadgeProps) {
  if (!stage) {
    return (
      <span className={`px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 ${className}`}>
        new
      </span>
    );
  }

  const normalizedStage = stage.toLowerCase().replace(/\s+/g, "_");

  const getBadgeStyles = (stage: string): string => {
    switch (stage) {
      case "interested":
        return "bg-green-100 text-green-700";
      case "replied":
        return "bg-blue-100 text-blue-700";
      case "estimate_scheduled":
        return "bg-amber-100 text-amber-700";
      case "estimate_completed":
        return "bg-purple-100 text-purple-700";
      case "verbal_yes":
        return "bg-emerald-100 text-emerald-700";
      case "contract_sent":
        return "bg-indigo-100 text-indigo-700";
      case "won":
        return "bg-green-600 text-white font-semibold";
      case "lost":
        return "bg-red-100 text-red-700";
      case "contacted":
        return "bg-gray-100 text-gray-700";
      case "new":
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const formatStageLabel = (stage: string): string => {
    return stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <span
      className={`px-2 py-1 rounded text-xs ${getBadgeStyles(normalizedStage)} ${className}`}
    >
      {formatStageLabel(normalizedStage)}
    </span>
  );
}














































