"use client";

import * as React from "react";
import { Calendar, ThumbsUp, ThumbsDown, Users, HelpCircle, Plane, Ban, Circle } from "lucide-react";

export type IntentPrimary =
  | "meeting_intent"
  | "interested"
  | "not_interested"
  | "referral"
  | "question"
  | "out_of_office"
  | "unsubscribe"
  | "other";

type IntentMeta = {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
};

const INTENT_META: Record<IntentPrimary, IntentMeta> = {
  meeting_intent: {
    label: "Meeting Intent",
    className: "bg-green-600 text-white",
    icon: Calendar,
  },
  interested: {
    label: "Interested",
    className: "bg-blue-600 text-white",
    icon: ThumbsUp,
  },
  not_interested: {
    label: "Not Interested",
    className: "bg-red-600 text-white",
    icon: ThumbsDown,
  },
  referral: {
    label: "Referral",
    className: "bg-purple-600 text-white",
    icon: Users,
  },
  question: {
    label: "Question",
    className: "bg-yellow-600 text-white",
    icon: HelpCircle,
  },
  out_of_office: {
    label: "Out of Office",
    className: "bg-orange-500 text-white",
    icon: Plane,
  },
  unsubscribe: {
    label: "Unsubscribe",
    className: "bg-red-800 text-white",
    icon: Ban,
  },
  other: {
    label: "Other",
    className: "bg-gray-600 text-white",
    icon: Circle,
  },
};

export function IntentBadge({ intent }: { intent: IntentPrimary | string | null | undefined }) {
  const normalizedIntent = (intent || "other") as IntentPrimary;
  const meta = INTENT_META[normalizedIntent] ?? INTENT_META.other;
  const Icon = meta.icon;
  const displayLabel = meta.label;

  return (
    <span className={`px-2 py-1 rounded text-white text-xs inline-flex items-center gap-1 ${meta.className}`}>
      <Icon className="h-3 w-3" />
      <span>{displayLabel}</span>
    </span>
  );
}










