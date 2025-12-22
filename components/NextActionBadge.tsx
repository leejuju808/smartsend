// Block 22094 — SmartSend Roofing AI Next-Action Engine v1
// NextActionBadge: displays AI-recommended next action on pipeline cards
// Shows colored badge with action type and reason

"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type NextActionType =
  | "send_followup"
  | "send_soft_reengagement"
  | "send_tone_reset"
  | "request_photos"
  | "call_now"
  | "schedule_inspection"
  | "send_proposal_now"
  | "resend_proposal"
  | "clarify_proposal"
  | "ask_insurance_status"
  | "ask_timeline"
  | "ask_additional_details"
  | "recovery_message"
  | "escalate_to_owner";

export interface NextActionBadgeProps {
  action?: NextActionType | null;
  reason?: string | null;
  variant?: "badge" | "compact" | "card"; // card for pipeline cards
  className?: string;
}

// Action label mapping
const ACTION_LABELS: Record<NextActionType, string> = {
  send_followup: "Send Follow-Up",
  send_soft_reengagement: "Soft Re-Engagement",
  send_tone_reset: "Tone Reset",
  request_photos: "Request Photos",
  call_now: "Call Homeowner Now",
  schedule_inspection: "Schedule Inspection",
  send_proposal_now: "Send Proposal Now",
  resend_proposal: "Resend Proposal",
  clarify_proposal: "Clarify Proposal",
  ask_insurance_status: "Ask Insurance Status",
  ask_timeline: "Ask Timeline",
  ask_additional_details: "Ask Details",
  recovery_message: "Recovery Message",
  escalate_to_owner: "Escalate to Owner",
};

// Action emoji mapping
const ACTION_EMOJIS: Record<NextActionType, string> = {
  send_followup: "💬",
  send_soft_reengagement: "💬",
  send_tone_reset: "🔄",
  request_photos: "📷",
  call_now: "📞",
  schedule_inspection: "📅",
  send_proposal_now: "📄",
  resend_proposal: "📄",
  clarify_proposal: "❓",
  ask_insurance_status: "🏠",
  ask_timeline: "⏰",
  ask_additional_details: "📋",
  recovery_message: "🚨",
  escalate_to_owner: "⚠️",
};

// Action color mapping (for badges)
const ACTION_COLORS: Record<NextActionType, string> = {
  send_followup: "bg-blue-500 text-white",
  send_soft_reengagement: "bg-yellow-500 text-white",
  send_tone_reset: "bg-orange-500 text-white",
  request_photos: "bg-purple-500 text-white",
  call_now: "bg-red-600 text-white",
  schedule_inspection: "bg-green-600 text-white",
  send_proposal_now: "bg-blue-600 text-white",
  resend_proposal: "bg-blue-500 text-white",
  clarify_proposal: "bg-yellow-600 text-white",
  ask_insurance_status: "bg-indigo-500 text-white",
  ask_timeline: "bg-teal-500 text-white",
  ask_additional_details: "bg-gray-500 text-white",
  recovery_message: "bg-red-700 text-white",
  escalate_to_owner: "bg-red-800 text-white",
};

// Critical actions (red/urgent)
const CRITICAL_ACTIONS: NextActionType[] = [
  "call_now",
  "recovery_message",
  "escalate_to_owner",
];

// Proposal-related actions (blue)
const PROPOSAL_ACTIONS: NextActionType[] = [
  "send_proposal_now",
  "resend_proposal",
  "clarify_proposal",
];

export function NextActionBadge({
  action,
  reason,
  variant = "badge",
  className,
}: NextActionBadgeProps) {
  if (!action) {
    return null;
  }

  const label = ACTION_LABELS[action] || action;
  const emoji = ACTION_EMOJIS[action] || "🧠";
  const colorClasses = ACTION_COLORS[action] || "bg-gray-500 text-white";

  // Compact variant (just emoji + text, no background)
  if (variant === "compact") {
    return (
      <span className={cn("text-xs flex items-center gap-1", className)}>
        <span>{emoji}</span>
        <span className="truncate">{label}</span>
      </span>
    );
  }

  // Card variant (for pipeline cards - top badge)
  if (variant === "card") {
    const isCritical = CRITICAL_ACTIONS.includes(action);
    const isProposal = PROPOSAL_ACTIONS.includes(action);
    
    return (
      <div className={cn("w-full", className)}>
        <div
          className={cn(
            "px-2 py-1 rounded-t-lg text-[0.65rem] font-semibold flex items-center gap-1.5",
            isCritical
              ? "bg-red-600 text-white"
              : isProposal
              ? "bg-blue-600 text-white"
              : "bg-yellow-500 text-white"
          )}
        >
          <span>{emoji}</span>
          <span className="truncate flex-1">{label}</span>
        </div>
        {reason && (
          <div className="px-2 py-0.5 text-[0.6rem] text-neutral-400 bg-neutral-900/50 rounded-b-lg line-clamp-1">
            {reason}
          </div>
        )}
      </div>
    );
  }

  // Default badge variant
  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold",
          colorClasses
        )}
      >
        <span>{emoji}</span>
        <span>{label}</span>
      </span>
      {reason && (
        <span className="text-xs text-neutral-400 max-w-xs line-clamp-2">
          {reason}
        </span>
      )}
    </div>
  );
}









































