// Block 8720 — Follow-Up Task Board
// app/(dashboard)/followups/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLeadDrawer } from "@/contexts/LeadDrawerContext";

type Lead = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  outcome?: string | null;
};

type Task = {
  id: string;
  lead_id: string;
  title: string;
  status: "open" | "done";
  due_at?: string | null;
  created_at: string;
  leads: Lead;
};

export default function FollowupsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { openLead } = useLeadDrawer();

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/followups", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setTasks(data.tasks ?? []);
      }
    } catch (e) {
      console.error("Follow-ups load error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function toggleDone(taskId: string, done: boolean) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: done ? "done" : "open" }),
      });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch (e) {
      console.error("Task toggle error:", e);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-neutral-50">Follow-Ups</h1>
        <p className="text-sm text-neutral-400">
          Every homeowner that SmartSend thinks you should follow up with today.
        </p>
      </header>

      <div className="flex-1 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-100">
        {loading && (
          <div className="text-xs text-neutral-400">Loading follow-ups…</div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="text-xs text-neutral-400">
            No open follow-ups. SmartSend will add tasks here whenever replies
            need your attention.
          </div>
        )}

        {!loading && tasks.length > 0 && (
          <div className="space-y-3">
            {tasks.map((task) => {
              const lead = task.leads;
              const name =
                lead.name ||
                [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                lead.email;

              const due = task.due_at ? new Date(task.due_at) : null;
              const dueLabel = due
                ? due.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "No due date";

              const badge =
                lead.outcome === "won"
                  ? "Won"
                  : lead.outcome === "lost"
                  ? "Lost"
                  : "Open";

              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openLead(lead.id)}
                        className="text-sm font-semibold text-neutral-50 hover:underline text-left"
                      >
                        {name}
                      </button>
                      <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-400">
                        {badge}
                      </span>
                    </div>
                    <div className="text-[0.7rem] text-neutral-400">
                      {task.title}
                    </div>
                    <div className="text-[0.65rem] text-neutral-500">
                      Due: {dueLabel}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      href={`/inbox/${lead.id}`}
                      className="rounded-xl border border-neutral-700 px-3 py-1 text-[0.7rem] font-semibold text-neutral-100 hover:bg-neutral-800 transition-colors"
                    >
                      Open thread
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleDone(task.id, true)}
                      className="rounded-xl bg-emerald-500 px-3 py-1 text-[0.7rem] font-semibold text-neutral-950 hover:bg-emerald-400 transition-colors"
                    >
                      Mark Done
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

