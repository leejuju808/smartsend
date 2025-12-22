"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { MailQuestion, Smile, Meh, Frown, Ban, Plane } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export type Intent =
  | "positive"
  | "neutral"
  | "question"
  | "negative"
  | "unsubscribe"
  | "out_of_office"
  | "unknown";

type IntentMeta = {
  label: string;
  Icon: LucideIcon;
  className: string;
};

const INTENT_META: Record<Intent, IntentMeta> = {
  positive: { label: "Positive", Icon: Smile, className: "bg-emerald-600 text-white" },
  neutral: { label: "Neutral", Icon: Meh, className: "bg-slate-600 text-white" },
  question: { label: "Question", Icon: MailQuestion, className: "bg-blue-600 text-white" },
  negative: { label: "Negative", Icon: Frown, className: "bg-rose-600 text-white" },
  unsubscribe: {
    label: "Unsubscribe",
    Icon: Ban,
    className: "bg-zinc-800 text-white border border-zinc-700",
  },
  out_of_office: {
    label: "OOO",
    Icon: Plane,
    className: "bg-amber-600 text-white",
  },
  unknown: { label: "Unknown", Icon: Meh, className: "bg-gray-500 text-white" },
};

export function IntentBadge({ intent }: { intent: Intent | null | undefined }) {
  const key = (intent ?? "unknown") as Intent;
  const { label, Icon, className } = INTENT_META[key] ?? INTENT_META.unknown;

  return (
    <Badge className={`gap-1 rounded-xl px-2 py-0.5 text-[11px] font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}





