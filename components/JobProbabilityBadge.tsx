// Block 21801 — SmartSend Roofing Job Probability Engine v1
// JobProbabilityBadge: displays job win probability score and category

"use client";

import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  score?: number | null;
  category?: string | null;
};

function getCategoryColor(category: string | null | undefined): string {
  if (!category) return "text-gray-500";
  
  const cat = category.toLowerCase();
  if (cat === "high") return "text-green-400";
  if (cat === "medium") return "text-yellow-300";
  if (cat === "low") return "text-red-400";
  if (cat === "dead") return "text-gray-500";
  return "text-gray-500";
}

function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return "unknown";
  return category.toLowerCase();
}

export function JobProbabilityBadge({ score, category }: Props) {
  const colorClass = getCategoryColor(category);
  const categoryLabel = getCategoryLabel(category);
  const displayScore = score != null ? score : "--";

  return (
    <div className="flex items-center gap-2">
      <span className={cn("font-bold", colorClass)}>{displayScore}%</span>
      <span className={cn("capitalize text-sm", colorClass)}>
        {categoryLabel} chance
      </span>
    </div>
  );
}









































