"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock, Plane } from "lucide-react";

export function OOOChip({
  resumeAfter,
  active,
  cleanPreview,
}: {
  resumeAfter: string | null;
  active: boolean;
  cleanPreview?: string | undefined | null;
}) {
  if (!active && !resumeAfter) return null;

  const date = resumeAfter ? new Date(resumeAfter) : null;
  const snippet =
    typeof cleanPreview === "string" && cleanPreview.trim().length
      ? cleanPreview.trim()
      : null;
  const formatted = date
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "TBD";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1.5">
            <Plane className="h-3.5 w-3.5" />
            {active ? "OOO" : "OOO Ended"}
            {date && (
              <span className="ml-1 inline-flex items-center gap-1 opacity-80">
                <Clock className="h-3 w-3" />
                {formatted}
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2 text-sm">
            <div>
              {active
                ? date
                  ? `Auto-pause until ${formatted}`
                  : "Out-of-office detected; resume date unknown"
                : "OOO window has passed; thread is eligible to resume"}
            </div>
            {snippet && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {snippet}
              </pre>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

