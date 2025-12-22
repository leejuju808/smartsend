// Block 21925 — SmartSend Roofing Lead Intent Classifier v1
// IntentBadge: displays AI-classified roofing-specific intent badges

"use client";

import React from "react";
import { cn } from "@/lib/utils";

type IntentBadgeProps = {
  intent?: string | null;
  className?: string;
  compact?: boolean; // Compact display mode
};

function getIntentColor(intent: string | null | undefined): string {
  if (!intent) return "bg-gray-700";
  
  const i = intent.toLowerCase().trim();
  
  // Booking / Scheduling Intents - Green
  if (i === "intent_book_estimate" || i === "intent_schedule_inspection") {
    return "bg-green-600";
  }
  
  // Urgent Service - Red
  if (i === "intent_needs_asap_service") {
    return "bg-red-600";
  }
  
  // Price / Quote Intents - Blue
  if (i === "intent_request_price") {
    return "bg-blue-600";
  }
  
  // Price Shopping - Yellow
  if (i === "intent_price_shopping") {
    return "bg-yellow-600";
  }
  
  // Insurance Intents - Purple
  if (i === "intent_provide_insurance_info" || i === "intent_ask_insurance_process") {
    return "bg-purple-600";
  }
  
  // Decision-Making - Green (ready) / Gray (deciding)
  if (i === "intent_ready_for_proposal") {
    return "bg-green-700";
  }
  if (i === "intent_still_deciding") {
    return "bg-gray-600";
  }
  
  // Clarification - Cyan
  if (i === "intent_question_about_scope") {
    return "bg-cyan-600";
  }
  
  // Rejection Intents - Gray
  if (i === "intent_not_interested" || i === "intent_cancel_or_stop") {
    return "bg-gray-500";
  }
  
  return "bg-gray-700";
}

function formatIntent(intent: string | null | undefined): string {
  if (!intent) return "Not classified";
  
  const i = intent.toLowerCase().trim();
  
  // Remove "intent_" prefix and replace underscores with spaces
  return i
    .replace(/^intent_/, "")
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function IntentBadge({
  intent,
  className = "",
  compact = false,
}: IntentBadgeProps) {
  const intentColor = getIntentColor(intent);
  const formattedIntent = formatIntent(intent);

  if (compact) {
    return (
      <span
        className={cn(
          "px-2 py-1 rounded-full text-xs text-white font-medium",
          intentColor,
          className
        )}
      >
        {formattedIntent}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "px-3 py-1.5 rounded-full text-sm text-white font-medium",
        intentColor,
        className
      )}
    >
      {formattedIntent}
    </span>
  );
}

// Export a default variant for easier imports
export default IntentBadge;









































