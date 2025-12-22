"use client";

import { useState } from "react";
import { useThreadsNew } from "@/hooks/useThreadsNew";
import Link from "next/link";

export default function RepliesIndex() {
  const [q, setQ] = useState("");
  const { threads, loading } = useThreadsNew(q);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Replies Inbox</h1>
        <input
          className="border rounded-xl px-3 py-2 w-72"
          placeholder="Search lead email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && <div className="p-8 text-center">Loading…</div>}

      <div className="grid gap-2">
        {threads.map((t) => (
          <Link
            key={t.id}
            href={`/dashboard/replies-new/${t.id}`}
            className="rounded-2xl border p-4 hover:bg-muted/40 transition"
          >
            <div className="flex justify-between">
              <div className="font-medium">{t.lead_email}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(t.last_message_at).toLocaleString()}
              </div>
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {t.subject || "(no subject)"}
            </div>
            <div className="mt-2">
              <span className="text-[11px] px-2 py-1 rounded-full border">
                {t.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

