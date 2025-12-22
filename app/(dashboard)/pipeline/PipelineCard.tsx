"use client";

import { useDraggable } from "@dnd-kit/core";
import { RiskBadge } from "@/src/components/pipeline/RiskBadge";
import { useJobSaveStatus } from "@/components/job-save/useJobSaveStatus";
import { NextActionBadge, NextActionType } from "@/components/NextActionBadge";
import { cn } from "@/lib/utils";

type Lead = {
  id: string;
  name?: string | null;
  email?: string | null;
  city?: string | null;
  last_message_snippet?: string | null;
  risk_score?: number | null;
  risk_category?: "low" | "medium" | "high" | "critical" | null;
  next_action?: NextActionType | null;
  next_action_reason?: string | null;
  is_hot?: boolean | null;
  hot_reason?: string | null;
  hot_score?: number | null;
};

type Props = {
  lead: Lead;
  openLead: (leadId: string) => void;
};

export function PipelineCard({ lead, openLead }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: lead.id,
  });
  
  const { hasActiveSave, severity } = useJobSaveStatus(lead.id);

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }
    : undefined;

  // Red pulse animation classes for at-risk jobs
  const pulseClasses = hasActiveSave
    ? severity === "critical"
      ? "animate-pulse-red border-red-500 shadow-lg shadow-red-500/50 ring-2 ring-red-500/50"
      : severity === "high"
      ? "animate-pulse-red border-red-400 shadow-lg shadow-red-400/40 ring-2 ring-red-400/40"
      : "border-orange-400 shadow-lg shadow-orange-400/30 ring-2 ring-orange-400/30"
    : "";

  // Hot lead glow classes (orange/red border glow)
  const hotLeadClasses = lead.is_hot
    ? "border-orange-500 shadow-lg shadow-orange-500/50 ring-2 ring-orange-500/50 bg-neutral-900"
    : "";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => openLead(lead.id)}
      className={cn(
        "cursor-pointer rounded-xl border text-xs text-neutral-100 shadow hover:border-emerald-500/50 overflow-hidden",
        hasActiveSave ? "bg-neutral-900" : "bg-neutral-900/90 border-neutral-800",
        pulseClasses,
        hotLeadClasses
      )}
      style={style}
    >
      {/* Block 22179 — Hot Lead Badge (Top Priority) */}
      {lead.is_hot && (
        <div className="mb-1 px-2 pt-1">
          <div
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold bg-orange-500/20 border border-orange-400 text-orange-300"
            title={lead.hot_reason || "Hot lead detected"}
          >
            🔥 HOT LEAD
          </div>
        </div>
      )}

      {/* Block 22094 — Next Action Badge (Top) */}
      {lead.next_action && (
        <div className="mb-1">
          <NextActionBadge
            action={lead.next_action}
            reason={lead.next_action_reason}
            variant="card"
          />
        </div>
      )}

      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-neutral-100 truncate">
              {lead.name || lead.email || "Unknown"}
            </div>
            {lead.city && (
              <div className="text-[0.65rem] text-neutral-400">{lead.city}</div>
            )}
            {lead.last_message_snippet && (
              <div className="text-[0.7rem] text-neutral-300 mt-1 line-clamp-2">
                {lead.last_message_snippet}
              </div>
            )}
          </div>
          {lead.risk_score !== null && lead.risk_score > 0 && lead.risk_category && (
            <div className="flex-shrink-0">
              <RiskBadge
                category={lead.risk_category}
                score={lead.risk_score}
                showLabel={lead.risk_category === "critical" || lead.risk_category === "high"}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

















