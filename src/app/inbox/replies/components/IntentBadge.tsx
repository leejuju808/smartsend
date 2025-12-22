"use client";

import type { ReplyIntent } from "@/types/reply-inbox";

interface IntentBadgeProps {
  intent: ReplyIntent;
}

const INTENT_COLORS: Record<ReplyIntent, string> = {
  hot: "bg-red-100 text-red-800 border-red-300",
  warm: "bg-orange-100 text-orange-800 border-orange-300",
  follow_up: "bg-blue-100 text-blue-800 border-blue-300",
  not_interested: "bg-gray-100 text-gray-800 border-gray-300",
  unclassified: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

const INTENT_LABELS: Record<ReplyIntent, string> = {
  hot: "HOT",
  warm: "WARM",
  follow_up: "FOLLOW-UP",
  not_interested: "NOT INTERESTED",
  unclassified: "UNCLASSIFIED",
};

export default function IntentBadge({ intent }: IntentBadgeProps) {
  return (
    <span
      className={`px-2 py-0.5 text-xs font-bold rounded border ${INTENT_COLORS[intent]}`}
    >
      {INTENT_LABELS[intent]}
    </span>
  );
}





























































