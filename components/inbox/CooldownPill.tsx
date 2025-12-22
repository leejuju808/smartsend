"use client";

import * as React from "react";

export default function CooldownPill({ nextAt }: { nextAt: string | null }) {
  if (!nextAt) return null;

  const next = new Date(nextAt);
  const now = new Date();

  if (Number.isNaN(next.getTime()) || next <= now) {
    return null;
  }

  return (
    <span
      title={`Next eligible: ${next.toLocaleString()}`}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide text-foreground/80 bg-amber-100/40 dark:bg-amber-900/20"
    >
      Cooldown
    </span>
  );
}


