// components/leads/lead-status-badge.tsx

"use client";

import { cn } from "@/lib/utils";

type LeadStatus = "new" | "queued" | "sent" | "replied" | "bounced" | "suppressed" | string;

type Props = {
  status: LeadStatus | null | undefined;
};

export function LeadStatusBadge({ status }: Props) {
  const value = (status || "new").toLowerCase() as LeadStatus;

  const labelMap: Record<LeadStatus, string> = {
    new: "New",
    queued: "Queued",
    sent: "Sent",
    replied: "Replied",
    bounced: "Bounced",
    suppressed: "Suppressed",
  } as any;

  const colorMap: Record<LeadStatus, string> = {
    new: "bg-slate-100 text-slate-700 border-slate-200",
    queued: "bg-blue-50 text-blue-700 border-blue-200",
    sent: "bg-indigo-50 text-indigo-700 border-indigo-200",
    replied: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bounced: "bg-rose-50 text-rose-700 border-rose-200",
    suppressed: "bg-zinc-100 text-zinc-700 border-zinc-200",
  } as any;

  const label = labelMap[value] ?? status ?? "New";
  const colors = colorMap[value] ?? "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colors
      )}
    >
      {label}
    </span>
  );
}

































































