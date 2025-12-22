"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, HelpCircle, XCircle, Ban, ShieldAlert, Zap } from "lucide-react";

export type ReplyIntent = "hot" | "warm" | "neutral" | "not_interested" | "unsubscribe" | "spam" | "bounce";
export type ReplyNextAction = "book" | "answer" | "stop" | "info_needed" | "none";

interface ReplyClassificationTagProps {
  intent: ReplyIntent | null | undefined;
  summary?: string | null;
  next_action?: ReplyNextAction | null;
  confidence?: number | null;
  showSummary?: boolean;
  showAction?: boolean;
  className?: string;
}

const intentConfig: Record<
  ReplyIntent,
  { label: string; color: string; bgColor: string; icon: React.ReactNode }
> = {
  hot: {
    label: "HOT",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: <Zap className="h-3 w-3" />,
  },
  warm: {
    label: "WARM",
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  neutral: {
    label: "NEUTRAL",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    icon: <HelpCircle className="h-3 w-3" />,
  },
  not_interested: {
    label: "NOT INTERESTED",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: <XCircle className="h-3 w-3" />,
  },
  unsubscribe: {
    label: "UNSUBSCRIBE",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: <Ban className="h-3 w-3" />,
  },
  spam: {
    label: "SPAM",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    icon: <ShieldAlert className="h-3 w-3" />,
  },
  bounce: {
    label: "BOUNCE",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const actionConfig: Record<
  ReplyNextAction,
  { label: string; color: string; bgColor: string }
> = {
  book: {
    label: "Book",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  answer: {
    label: "Answer",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  stop: {
    label: "Stop",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  info_needed: {
    label: "Info Needed",
    color: "text-purple-700 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  none: {
    label: "None",
    color: "text-gray-700 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
};

export function ReplyClassificationTag({
  intent,
  summary,
  next_action,
  confidence,
  showSummary = false,
  showAction = true,
  className,
}: ReplyClassificationTagProps) {
  if (!intent) {
    return null;
  }

  const config = intentConfig[intent];
  const lowConfidence = confidence !== null && confidence !== undefined && confidence < 0.7;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            "text-xs font-semibold flex items-center gap-1",
            config.color,
            config.bgColor,
            "border-current/20"
          )}
        >
          {config.icon}
          {config.label}
        </Badge>

        {showAction && next_action && next_action !== "none" && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              actionConfig[next_action].color,
              actionConfig[next_action].bgColor,
              "border-current/20"
            )}
          >
            AI Action: {actionConfig[next_action].label}
          </Badge>
        )}

        {lowConfidence && (
          <Badge variant="outline" className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 border-current/20">
            Low confidence
          </Badge>
        )}
      </div>

      {showSummary && summary && (
        <p className="text-xs text-muted-foreground mt-1">{summary}</p>
      )}
    </div>
  );
}
























































