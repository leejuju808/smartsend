"use client";

import { cn } from "@/lib/utils";

export interface RiskBadgeProps {
  category: "low" | "medium" | "high" | "critical";
  score: number;
  className?: string;
  showLabel?: boolean;
}

export function RiskBadge({
  category,
  score,
  className,
  showLabel = true,
}: RiskBadgeProps) {
  const getColorClasses = () => {
    switch (category) {
      case "critical":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      case "high":
        return "text-orange-400 bg-orange-400/10 border-orange-400/20";
      case "medium":
        return "text-yellow-300 bg-yellow-300/10 border-yellow-300/20";
      case "low":
        return "text-green-400 bg-green-400/10 border-green-400/20";
      default:
        return "text-gray-400 bg-gray-400/10 border-gray-400/20";
    }
  };

  const getEmoji = () => {
    switch (category) {
      case "critical":
        return "🚨";
      case "high":
        return "⚠️";
      case "medium":
        return "🟡";
      case "low":
        return "🟢";
      default:
        return "";
    }
  };

  const getLabel = () => {
    switch (category) {
      case "critical":
        return "Critical Risk";
      case "high":
        return "High Risk";
      case "medium":
        return "Medium Risk";
      case "low":
        return "Low Risk";
      default:
        return "Unknown";
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border",
        getColorClasses(),
        className
      )}
    >
      <span className="text-xs">{getEmoji()}</span>
      <span className="font-bold">{score}</span>
      {showLabel && (
        <span className="capitalize text-[0.65rem] opacity-90">
          {getLabel()}
        </span>
      )}
    </div>
  );
}









































