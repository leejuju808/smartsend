// Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1
// HomeownerToneTag: displays AI-classified tone and intent badges

"use client";

import React from "react";
import { cn } from "@/lib/utils";

type HomeownerToneTagProps = {
  tone?: string | null;
  intent?: string | null;
  className?: string;
  showLabel?: boolean; // Whether to show "Tone:" and "Intent:" labels
  compact?: boolean; // Compact display mode
};

function getToneColor(tone: string | null | undefined): string {
  if (!tone) return "text-gray-500";
  
  const t = tone.toLowerCase().trim();
  if (t === "positive" || t === "appreciation") return "text-green-400";
  if (t === "angry" || t === "impatient") return "text-red-400";
  if (t === "confused") return "text-yellow-300";
  if (t === "price-shopping") return "text-blue-300";
  if (t === "scheduling-focused") return "text-purple-300";
  if (t === "neutral") return "text-gray-400";
  return "text-gray-500";
}

function getIntentColor(intent: string | null | undefined): string {
  if (!intent) return "text-gray-500";
  
  const i = intent.toLowerCase().trim();
  
  // Block 21925 — Roofing-specific intents
  // Booking / Scheduling Intents - Green
  if (i === "intent_book_estimate" || i === "intent_schedule_inspection") {
    return "text-green-400";
  }
  
  // Urgent Service - Red
  if (i === "intent_needs_asap_service") {
    return "text-red-400";
  }
  
  // Price / Quote Intents - Blue
  if (i === "intent_request_price") {
    return "text-blue-400";
  }
  
  // Price Shopping - Yellow
  if (i === "intent_price_shopping") {
    return "text-yellow-400";
  }
  
  // Insurance Intents - Purple
  if (i === "intent_provide_insurance_info" || i === "intent_ask_insurance_process") {
    return "text-purple-400";
  }
  
  // Decision-Making - Green (ready) / Gray (deciding)
  if (i === "intent_ready_for_proposal") {
    return "text-green-500";
  }
  if (i === "intent_still_deciding") {
    return "text-gray-400";
  }
  
  // Clarification - Cyan
  if (i === "intent_question_about_scope") {
    return "text-cyan-400";
  }
  
  // Rejection Intents - Gray/Red
  if (i === "intent_not_interested" || i === "intent_cancel_or_stop") {
    return "text-gray-500";
  }
  
  // Legacy intents (Block 21823)
  if (i === "high intent" || i === "ready to book") return "text-green-400";
  if (i === "medium intent") return "text-yellow-300";
  if (i === "low intent" || i === "stalling") return "text-gray-400";
  if (i === "not interested") return "text-red-400";
  if (i === "needs clarification") return "text-blue-300";
  if (i === "wants price") return "text-purple-300";
  
  return "text-gray-500";
}

function formatTone(tone: string | null | undefined): string {
  if (!tone) return "—";
  const t = tone.toLowerCase().trim();
  // Convert kebab-case to readable
  return t.replace(/-/g, " ");
}

function formatIntent(intent: string | null | undefined): string {
  if (!intent) return "—";
  const i = intent.toLowerCase().trim();
  
  // Block 21925 — Handle roofing-specific intents
  if (i.startsWith("intent_")) {
    // Remove "intent_" prefix and replace underscores with spaces
    return i
      .replace(/^intent_/, "")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  
  // Legacy intents (Block 21823) - Capitalize first letter of each word
  return i
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function HomeownerToneTag({
  tone,
  intent,
  className = "",
  showLabel = false,
  compact = false,
}: HomeownerToneTagProps) {
  const toneColor = getToneColor(tone);
  const intentColor = getIntentColor(intent);
  const formattedTone = formatTone(tone);
  const formattedIntent = formatIntent(intent);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs", className)}>
        {tone && (
          <>
            <span className={cn("capitalize font-medium", toneColor)}>
              {formattedTone}
            </span>
            {intent && <span className="text-gray-500">•</span>}
          </>
        )}
        {intent && (
          <span className={cn("capitalize font-medium", intentColor)}>
            {formattedIntent}
          </span>
        )}
        {!tone && !intent && (
          <span className="text-gray-500 text-xs">Not classified</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      {tone && (
        <div className="flex items-center gap-1.5">
          {showLabel && <span className="text-gray-500 text-xs">Tone:</span>}
          <span className={cn("capitalize font-medium", toneColor)}>
            {formattedTone}
          </span>
        </div>
      )}
      {tone && intent && (
        <span className="text-gray-500">•</span>
      )}
      {intent && (
        <div className="flex items-center gap-1.5">
          {showLabel && <span className="text-gray-500 text-xs">Intent:</span>}
          <span className={cn("capitalize font-medium", intentColor)}>
            {formattedIntent}
          </span>
        </div>
      )}
      {!tone && !intent && (
        <span className="text-gray-500 text-xs">Not classified</span>
      )}
    </div>
  );
}

// Badge variant for inline display
export function HomeownerToneBadge({
  tone,
  intent,
  className = "",
}: Omit<HomeownerToneTagProps, "showLabel" | "compact">) {
  return (
    <HomeownerToneTag
      tone={tone}
      intent={intent}
      className={className}
      compact={true}
    />
  );
}

