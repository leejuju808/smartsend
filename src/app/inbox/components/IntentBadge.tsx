"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";
import { getIntentIcon } from "./icons/InboxIcons";

interface IntentBadgeProps {
  intent: string | null;
  showIcon?: boolean;
  size?: "sm" | "md";
}

export function IntentBadge({ intent, showIcon = false, size = "md" }: IntentBadgeProps) {
  if (!intent) return null;

  const intentLower = intent.toLowerCase();
  
  const variants: Record<string, { 
    label: string; 
    bgColor: string; 
    textColor: string; 
    borderColor: string;
  }> = {
    hot: {
      label: "HOT",
      bgColor: colors.intentBg.hot,
      textColor: colors.intent.hot,
      borderColor: colors.intent.hot,
    },
    warm: {
      label: "WARM",
      bgColor: colors.intentBg.warm,
      textColor: colors.intent.warm,
      borderColor: colors.intent.warm,
    },
    follow_up: {
      label: "FOLLOW-UP",
      bgColor: colors.intentBg.followUp,
      textColor: colors.intent.followUp,
      borderColor: colors.intent.followUp,
    },
    dead: {
      label: "DEAD",
      bgColor: colors.intentBg.dead,
      textColor: colors.intent.dead,
      borderColor: colors.intent.dead,
    },
    cold: {
      label: "COLD",
      bgColor: colors.intentBg.dead,
      textColor: colors.intent.dead,
      borderColor: colors.intent.dead,
    },
  };

  const variant = variants[intentLower] || {
    label: intent.toUpperCase(),
    bgColor: colors.neutralLight,
    textColor: colors.neutral,
    borderColor: colors.neutral,
  };

  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold transition-opacity",
        sizeClasses
      )}
      style={{
        backgroundColor: variant.bgColor,
        color: variant.textColor,
        borderColor: variant.borderColor,
      }}
    >
      {showIcon && getIntentIcon(intent, 12)}
      {variant.label}
    </span>
  );
}

