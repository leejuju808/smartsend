// Block 10500 — SmartSend Lead Brain v1
// Lead Intent Badge Component

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

export type LeadIntentClassification = 
  | "HOT" 
  | "WARM" 
  | "NOT_INTERESTED" 
  | "FOLLOW_UP" 
  | "OUT_OF_SCOPE";

interface LeadIntentBadgeProps {
  classification: LeadIntentClassification | null | undefined;
  confidence?: number | null;
  showConfidence?: boolean;
}

const INTENT_COLORS: Record<LeadIntentClassification, string> = {
  HOT: "bg-red-600 text-white border-red-700",
  WARM: "bg-yellow-500 text-white border-yellow-600",
  NOT_INTERESTED: "bg-gray-500 text-white border-gray-600",
  FOLLOW_UP: "bg-blue-500 text-white border-blue-600",
  OUT_OF_SCOPE: "bg-black text-white border-gray-800",
};

const INTENT_LABELS: Record<LeadIntentClassification, string> = {
  HOT: "🔥 HOT",
  WARM: "🌤️ WARM",
  NOT_INTERESTED: "🚫 NOT INTERESTED",
  FOLLOW_UP: "🔁 FOLLOW UP",
  OUT_OF_SCOPE: "📦 OUT OF SCOPE",
};

export function LeadIntentBadge({ 
  classification, 
  confidence,
  showConfidence = false 
}: LeadIntentBadgeProps) {
  if (!classification) return null;

  const colorClass = INTENT_COLORS[classification] || "bg-gray-500 text-white";
  const label = INTENT_LABELS[classification] || classification;

  return (
    <Badge
      className={`px-2 py-1 rounded text-xs font-semibold border ${colorClass}`}
      title={
        confidence !== null && confidence !== undefined
          ? `Confidence: ${Math.round(confidence * 100)}%`
          : undefined
      }
    >
      {label}
      {showConfidence && confidence !== null && confidence !== undefined && (
        <span className="ml-1 opacity-75">
          ({Math.round(confidence * 100)}%)
        </span>
      )}
    </Badge>
  );
}























































