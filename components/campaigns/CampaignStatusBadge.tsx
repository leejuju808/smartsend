"use client";

import { Badge } from "@/components/ui/badge";
import { AlertTriangle, PauseCircle, PlayCircle } from "lucide-react";

type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "completed"
  | "paused"
  | "paused_quota";

export function CampaignStatusBadge({
  status,
}: {
  status: CampaignStatus;
}) {
  const common = "inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[10px]";

  switch (status) {
    case "draft":
      return (
        <Badge
          className={`${common} bg-slate-900 border-slate-700 text-slate-100`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Draft
        </Badge>
      );
    case "scheduled":
      return (
        <Badge
          className={`${common} bg-blue-900/60 border-blue-700 text-blue-100`}
        >
          <PlayCircle className="h-3 w-3" />
          Scheduled
        </Badge>
      );
    case "running":
      return (
        <Badge
          className={`${common} bg-emerald-900/70 border-emerald-700 text-emerald-100`}
        >
          <PlayCircle className="h-3 w-3" />
          Running
        </Badge>
      );
    case "completed":
      return (
        <Badge
          className={`${common} bg-slate-900/80 border-slate-700 text-slate-100`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          Completed
        </Badge>
      );
    case "paused":
      return (
        <Badge
          className={`${common} bg-amber-900/70 border-amber-700 text-amber-100`}
        >
          <PauseCircle className="h-3 w-3" />
          Paused
        </Badge>
      );
    case "paused_quota":
      return (
        <Badge
          className={`${common} bg-red-900/70 border-red-700 text-red-100`}
        >
          <AlertTriangle className="h-3 w-3" />
          Paused (Quota)
        </Badge>
      );
    default:
      return (
        <Badge
          className={`${common} bg-slate-900 border-slate-700 text-slate-100`}
        >
          Unknown
        </Badge>
      );
  }
}




