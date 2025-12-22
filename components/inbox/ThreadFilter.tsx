"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CounterBadge } from "@/components/ui/counter-badge";
import { cn } from "@/lib/utils";

type Tab = "all" | "needs_reply" | "nudged" | "snoozed";

export function ThreadFilter({
  value,
  onChange,
  counts,
}: {
  value: Tab;
  onChange: (v: Tab) => void;
  counts?: Record<Tab, number>;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "needs_reply", label: "Needs Reply" },
    { key: "nudged", label: "Nudged" },
    { key: "snoozed", label: "Snoozed" },
  ];
  return (
    <div className="inline-flex rounded-2xl border bg-background p-1">
      {tabs.map((t) => (
        <Button
          key={t.key}
          size="sm"
          variant={value === t.key ? "default" : "ghost"}
          className={cn("rounded-2xl", value === t.key ? "" : "text-muted-foreground")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          <CounterBadge n={counts?.[t.key]} />
        </Button>
      ))}
    </div>
  );
}


