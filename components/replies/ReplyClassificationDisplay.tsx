"use client";

import { ReplyClassificationTag, type ReplyIntent, type ReplyNextAction } from "./ReplyClassificationTag";
import { Card } from "@/components/ui/card";

interface ReplyClassificationDisplayProps {
  intent: ReplyIntent | null | undefined;
  summary?: string | null;
  next_action?: ReplyNextAction | null;
  confidence?: number | null;
  className?: string;
}

/**
 * Full reply classification display component for lead drawers and detail views
 */
export function ReplyClassificationDisplay({
  intent,
  summary,
  next_action,
  confidence,
  className,
}: ReplyClassificationDisplayProps) {
  if (!intent) {
    return null;
  }

  return (
    <Card className={`p-3 space-y-2 ${className || ""}`}>
      <div className="text-xs font-semibold text-muted-foreground mb-2">
        Reply Classification
      </div>
      
      <ReplyClassificationTag
        intent={intent}
        summary={summary}
        next_action={next_action}
        confidence={confidence}
        showSummary={true}
        showAction={true}
      />

      {summary && (
        <div className="pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Summary:
          </div>
          <p className="text-xs text-foreground">{summary}</p>
        </div>
      )}

      {next_action && next_action !== "none" && (
        <div className="pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Recommended Action:
          </div>
          <p className="text-xs text-foreground capitalize">
            {next_action === "book" && "Schedule a meeting or call"}
            {next_action === "answer" && "Provide information or answer questions"}
            {next_action === "stop" && "Stop sending follow-ups"}
            {next_action === "info_needed" && "Request additional information"}
          </p>
        </div>
      )}

      {confidence !== null && confidence !== undefined && (
        <div className="pt-2 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            AI Confidence:
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {Math.round(confidence * 100)}%
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
























































