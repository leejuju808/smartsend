"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  AlertTriangle,
  HelpCircle,
  MailCheck,
  MessageSquareText,
  Plane,
  Share2,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";

export type ThreadLabel =
  | "human_reply"
  | "out_of_office"
  | "question"
  | "positive"
  | "neutral"
  | "routing"
  | "bounce"
  | null;

const ICONS: Record<Exclude<ThreadLabel, null>, LucideIcon> = {
  human_reply: MailCheck,
  out_of_office: Plane,
  question: HelpCircle,
  positive: ThumbsUp,
  neutral: MessageSquareText,
  routing: Share2,
  bounce: AlertTriangle,
};

const TEXT: Record<Exclude<ThreadLabel, null>, string> = {
  human_reply: "Human",
  out_of_office: "OOO",
  question: "Question",
  positive: "Positive",
  neutral: "Neutral",
  routing: "Routing",
  bounce: "Bounce",
};

const VARIANT: Record<Exclude<ThreadLabel, null>, BadgeProps["variant"]> = {
  human_reply: "default",
  out_of_office: "secondary",
  question: "outline",
  positive: "success",
  neutral: "outline",
  routing: "outline",
  bounce: "destructive",
};

export function LabelBadge({ label }: { label: ThreadLabel }) {
  if (!label) return null;
  const Icon = ICONS[label];
  const text = TEXT[label];
  const variant = VARIANT[label] ?? "outline";

  return (
    <Badge variant={variant} className="gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {text}
    </Badge>
  );
}

