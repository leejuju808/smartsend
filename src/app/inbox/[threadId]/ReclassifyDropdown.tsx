"use client";

import { useState } from "react";

const OPTIONS = ["positive", "neutral", "question", "negative", "unsubscribe", "out_of_office", "unknown"] as const;

export function ReclassifyDropdown({ threadId, current }: { threadId: string; current?: string | null }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function choose(value: string) {
    try {
      setSaving(true);
      await fetch("/api/replies/reclassify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, human_intent: value }),
      });
      window.location.reload();
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button className="rounded-full border px-2 py-1 text-xs" onClick={() => setOpen((prev) => !prev)}>
        Reclassify{current ? ` (${current})` : ""}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-xl border bg-white shadow dark:bg-zinc-900">
          {OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => choose(option)}
              disabled={saving}
              className="block w-full px-3 py-2 text-left text-xs hover:bg-zinc-50 disabled:opacity-60 dark:hover:bg-zinc-800"
            >
              {option === "out_of_office" ? "OOO" : option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

