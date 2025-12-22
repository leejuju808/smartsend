"use client";

import { Badge } from "@/components/ui/badge";

type ReplyIntent =
  | "positive"
  | "neutral"
  | "negative"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "spam"
  | "wrong_person"
  | "referral"
  | "not_sure"
  | null
  | undefined;

interface ReplyIntentBadgeProps {
  intent: ReplyIntent;
  sentiment?: "positive" | "neutral" | "negative" | null;
  className?: string;
}

const intentLabelMap: Record<Exclude<ReplyIntent, null | undefined>, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  out_of_office: "OOO",
  unsubscribe: "Unsubscribed",
  bounce: "Bounced",
  spam: "Spam",
  wrong_person: "Wrong Person",
  referral: "Referral",
  not_sure: "Not Sure",
};

export function ReplyIntentBadge({
  intent,
  sentiment,
  className,
}: ReplyIntentBadgeProps) {
  if (!intent) {
    return (
      <Badge variant="outline" className={className}>
        Unclassified
      </Badge>
    );
  }

  const label = intentLabelMap[intent] ?? intent;

  // Basic styling logic – tweak to taste
  let variant: "default" | "outline" | "destructive" | "secondary" = "outline";

  switch (intent) {
    case "positive":
    case "referral":
      variant = "default";
      break;
    case "unsubscribe":
    case "spam":
    case "bounce":
      variant = "destructive";
      break;
    case "out_of_office":
    case "wrong_person":
      variant = "secondary";
      break;
    case "negative":
      variant = "outline";
      break;
    case "neutral":
    case "not_sure":
    default:
      variant = "outline";
      break;
  }

  const sentimentSuffix =
    sentiment && sentiment !== "neutral" ? ` · ${sentiment}` : "";

  return (
    <Badge variant={variant} className={className}>
      {label}
      {sentimentSuffix}
    </Badge>
  );
}































































