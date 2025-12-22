"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  intent: string | null;
  subtype?: string | null;
  confidence?: number | null;
  autoPaused: boolean;
};

const intentMap: Record<string, { label: string; className: string }> = {
  replied: { label: "Replied", className: "bg-emerald-600 text-white" },
  out_of_office: { label: "OOO", className: "bg-amber-500 text-black" },
  not_interested: { label: "Not Interested", className: "bg-rose-600 text-white" },
  scheduling: { label: "Scheduling", className: "bg-sky-600 text-white" },
  question: { label: "Question", className: "bg-indigo-600 text-white" },
  neutral: { label: "Neutral", className: "bg-zinc-600 text-white" },
  unclear: { label: "Unclear", className: "bg-zinc-400 text-black" },
};

export function ReplyStatusBadge({ intent, subtype, confidence, autoPaused }: Props) {
  const meta = intent ? intentMap[intent] ?? intentMap["unclear"] : intentMap["unclear"];
  const title = intent ? meta.label : "Unclassified";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`rounded-2xl px-3 py-1 text-xs font-medium ${meta.className}`}>
              {title}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-xs">
            <p>
              {`Detected: ${title}`}
              {subtype ? ` · ${subtype}` : ""}
              {confidence != null ? ` · conf ${Math.round(confidence * 100)}%` : ""}
            </p>
          </TooltipContent>
        </Tooltip>

        {autoPaused && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="rounded-2xl px-3 py-1 text-xs border border-yellow-400"
              >
                Auto-Paused
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              <p>Lead automation paused (reply/OOO detected).</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}





