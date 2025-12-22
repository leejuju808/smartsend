"use client";

import Link from "next/link";

const items = [
  { key: "all", label: "All" },
  { key: "mine", label: "Assigned to Me" },
  { key: "unassigned", label: "Unassigned" },
  { key: "open", label: "Open" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "replied", label: "Replied" },
  { key: "out_of_office", label: "OOO" },
  { key: "paused", label: "Paused" },
  { key: "not_interested", label: "Not Interested" },
  { key: "scheduling", label: "Scheduling" },
  { key: "question", label: "Question" },
  { key: "neutral", label: "Neutral" },
  { key: "unclear", label: "Unclear" },
] as const;

export function FilterBar({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link key={it.key} href={{ query: { filter: it.key } }}>
          <button
            className={`px-3 py-1 rounded-2xl text-sm border ${
              active === it.key
                ? "bg-primary text-primary-foreground"
                : "bg-background"
            }`}
          >
            {it.label}
          </button>
        </Link>
      ))}
    </div>
  );
}





