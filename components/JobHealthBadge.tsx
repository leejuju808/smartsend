// Block 22017 — SmartSend Roofing Job Health Score v2
// JobHealthBadge: displays job health score (0-100) with trend indicator
// Displayed on:
// - pipeline cards
// - lead detail header
// - action queue
// - estimator coaching
// - owner dashboard

"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface JobHealthBadgeProps {
  score?: number | null;
  trend?: "improving" | "declining" | "stable" | null;
  className?: string;
  showTrend?: boolean;
  variant?: "badge" | "compact" | "glow"; // glow for pipeline cards
}

export function JobHealthBadge({
  score,
  trend,
  className,
  showTrend = true,
  variant = "badge",
}: JobHealthBadgeProps) {
  const displayScore = score != null ? score : "--";
  const displayTrend = trend || "stable";

  // Determine color based on score
  const getColorClasses = () => {
    if (score == null) {
      return "bg-gray-500 text-white";
    }
    if (score >= 75) {
      return "bg-green-600 text-white";
    }
    if (score >= 50) {
      return "bg-yellow-500 text-white";
    }
    return "bg-red-600 text-white";
  };

  // Get glow effect classes for pipeline cards
  const getGlowClasses = () => {
    if (score == null) return "";
    if (score >= 75) {
      return "shadow-lg shadow-green-500/50 ring-2 ring-green-500/30";
    }
    if (score >= 50) {
      return "shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-500/30 animate-pulse";
    }
    return "shadow-lg shadow-red-500/50 ring-2 ring-red-500/30 animate-pulse";
  };

  // Get trend indicator
  const getTrendIcon = () => {
    switch (displayTrend) {
      case "improving":
        return "↑";
      case "declining":
        return "↓";
      case "stable":
        return "→";
      default:
        return "";
    }
  };

  const getTrendColor = () => {
    switch (displayTrend) {
      case "improving":
        return "text-green-300";
      case "declining":
        return "text-red-300";
      case "stable":
        return "text-gray-300";
      default:
        return "text-gray-300";
    }
  };

  // Compact variant (just score)
  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold",
          getColorClasses(),
          className
        )}
      >
        {displayScore}
      </span>
    );
  }

  // Glow variant for pipeline cards
  if (variant === "glow") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold",
          getColorClasses(),
          getGlowClasses(),
          className
        )}
      >
        <span>Health: {displayScore}</span>
        {showTrend && (
          <span className={cn("text-xs", getTrendColor())}>
            {getTrendIcon()}
          </span>
        )}
      </span>
    );
  }

  // Default badge variant
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold",
        getColorClasses(),
        className
      )}
    >
      <span>Health: {displayScore}</span>
      {showTrend && (
        <span className={cn("text-xs capitalize", getTrendColor())}>
          ({displayTrend})
        </span>
      )}
    </span>
  );
}









































