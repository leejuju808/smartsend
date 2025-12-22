"use client";

import { useDroppable } from "@dnd-kit/core";
import { PipelineCard } from "./PipelineCard";
import { useLeadDrawer } from "@/contexts/LeadDrawerContext";

type Lead = {
  id: string;
  name?: string | null;
  email?: string | null;
  city?: string | null;
  last_message_snippet?: string | null;
};

type Props = {
  title: string;
  stage: string;
  items: Lead[];
  reload: () => void;
};

export function PipelineColumn({ title, stage, items, reload }: Props) {
  const { openLead } = useLeadDrawer();
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  const labelMap: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    scheduled: "Scheduled",
    proposal: "Proposal Sent",
    won: "Won",
    lost: "Lost",
  };

  return (
    <div
      ref={setNodeRef}
      className={`w-64 rounded-2xl border p-3 transition-colors ${
        isOver
          ? "border-emerald-500/50 bg-emerald-950/20"
          : "border-neutral-800 bg-neutral-950/80"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {labelMap[title] || title}
        </div>
        <div className="text-[0.65rem] text-neutral-500">{items.length}</div>
      </div>

      <div className="space-y-2">
        {items.map((lead) => (
          <PipelineCard key={lead.id} lead={lead} openLead={openLead} />
        ))}
      </div>
    </div>
  );
}

