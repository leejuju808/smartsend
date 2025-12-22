"use client";

import { cn } from "@/src/lib/utils";

export default function LabelPill({ label, reason }: { label: string | null; reason?: string | null }) {
  if (!label) return <span className="text-xs opacity-60">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        "bg-purple-500/10 border-purple-500 text-purple-600"
      )}
      title={reason ?? undefined}
    >
      {label}
    </span>
  );
}


