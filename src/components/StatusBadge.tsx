"use client";
import { cn } from "@/lib/utils";

const badgeClass = (s: string) =>
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium " +
  (s === "replied" ? "bg-green-500/10 border-green-500 text-green-600" :
   s === "failed" || s === "bounced" ? "bg-red-500/10 border-red-500 text-red-600" :
   s === "queued" || s === "sending" ? "bg-amber-500/10 border-amber-500 text-amber-600" :
   s === "sent" ? "bg-blue-500/10 border-blue-500 text-blue-600" :
   s === "new" ? "bg-slate-100 border-slate-300 text-slate-700" :
   "bg-muted border-muted-foreground/20 text-muted-foreground");

const map: Record<string, { label: string; className: string }> = {
  new:      { label: "New",      className: badgeClass("new") },
  queued:   { label: "Queued",   className: badgeClass("queued") },
  sending:  { label: "Sending",  className: badgeClass("sending") },
  sent:     { label: "Sent",     className: badgeClass("sent") },
  bounced:  { label: "Bounced",  className: badgeClass("bounced") },
  replied:  { label: "Replied ✅", className: badgeClass("replied") },
  failed:   { label: "Failed",   className: badgeClass("failed") },
  retrying: { label: "Retrying", className: badgeClass("sending") },
  paused:   { label: "Paused",   className: badgeClass("new") },
};

export function StatusBadge({ status }: { status: string }) {
  const m = map[status] ?? { label: status, className: badgeClass("new") };
  return (
    <span className={cn(m.className)}>
      {m.label}
    </span>
  );
}