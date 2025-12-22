// Block 22192 — SmartSend Roofing Win Probability Engine v1
// WinProbabilityBadge: displays win probability score (0-100%) with badge labels
// Displayed on:
// - pipeline cards (top of card)
// - lead detail header
// - estimator scorecards
// - owner dashboard
// - leaderboards
// - performance analytics

"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface WinProbabilityBadgeProps {
  probability?: number | null;
  className?: string;
  variant?: "badge" | "compact" | "card" | "glow"; // card for pipeline cards, glow for emphasis
  showLabel?: boolean; // Show "WIN LIKELY", "IN PLAY", "AT RISK OF LOSS"
}

export function WinProbabilityBadge({
  probability,
  className,
  variant = "badge",
  showLabel = true,
}: WinProbabilityBadgeProps) {
  const displayProbability = probability != null ? probability : "--";

  // Determine badge label and color based on probability ranges
  const getBadgeInfo = () => {
    if (probability == null) {
      return {
        label: "CALCULATING",
        colorClasses: "bg-gray-500 text-white",
        glowClasses: "",
      };
    }
    
    if (probability >= 70) {
      // High Probability (70-100%)
      return {
        label: "WIN LIKELY",
        colorClasses: "bg-blue-600 text-white",
        glowClasses: "shadow-lg shadow-blue-500/50 ring-2 ring-blue-500/30",
      };
    } else if (probability >= 40) {
      // Medium (40-69%)
      return {
        label: "IN PLAY",
        colorClasses: "bg-yellow-500 text-white",
        glowClasses: "shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-500/30",
      };
    } else {
      // Low (0-39%)
      return {
        label: "AT RISK OF LOSS",
        colorClasses: "bg-red-600 text-white",
        glowClasses: "shadow-lg shadow-red-500/50 ring-2 ring-red-500/30 animate-pulse",
      };
    }
  };

  const badgeInfo = getBadgeInfo();

  // Compact variant (just percentage)
  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold",
          badgeInfo.colorClasses,
          className
        )}
      >
        {displayProbability}%
      </span>
    );
  }

  // Card variant for pipeline cards (prominent display)
  if (variant === "card") {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)}>
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">
          Win Probability
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold",
            badgeInfo.colorClasses,
            badgeInfo.glowClasses,
            className
          )}
        >
          <span>📈 {displayProbability}%</span>
          {showLabel && (
            <span className="text-xs opacity-90">— {badgeInfo.label}</span>
          )}
        </span>
      </div>
    );
  }

  // Glow variant for emphasis
  if (variant === "glow") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold",
          badgeInfo.colorClasses,
          badgeInfo.glowClasses,
          className
        )}
      >
        <span>📈 {displayProbability}%</span>
        {showLabel && (
          <span className="text-xs opacity-90">— {badgeInfo.label}</span>
        )}
      </span>
    );
  }

  // Default badge variant
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-semibold",
        badgeInfo.colorClasses,
        className
      )}
    >
      <span>📈 {displayProbability}%</span>
      {showLabel && (
        <span className="text-xs opacity-90">— {badgeInfo.label}</span>
      )}
    </span>
  );
}









































