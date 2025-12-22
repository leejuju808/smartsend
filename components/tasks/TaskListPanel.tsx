// components/tasks/TaskListPanel.tsx
"use client";

import { useTasks } from "@/hooks/useTasks";
import Link from "next/link";

export function TaskListPanel() {
  const { tasks, loading } = useTasks("open");

  if (loading) {
    return (
      <div className="border rounded-2xl p-4 bg-white">
        <div className="text-xs text-gray-500">Loading tasks…</div>
      </div>
    );
  }

  return (
    <div className="border rounded-2xl p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <span className="text-[11px] text-gray-500">{tasks.length} open</span>
      </div>

      {tasks.length === 0 && (
        <div className="text-[11px] text-gray-500">
          No open tasks. When homeowners reply, we&apos;ll create call tasks here.
        </div>
      )}

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {tasks.map((t: any) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>

      <div className="mt-3">
        <Link
          href="/tasks"
          className="text-[11px] text-gray-600 underline"
        >
          View all tasks
        </Link>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: any }) {
  const due = task.due_at ? new Date(task.due_at) : null;
  const overdue = due && due.getTime() < Date.now();
  const contact = task.contacts;

  async function completeTask() {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    window.location.reload();
  }

  async function snoozeTask(minutes: number) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "snoozed", snoozeMinutes: minutes }),
    });
    window.location.reload();
  }

  return (
    <div className="border rounded-xl px-3 py-2 flex items-start justify-between gap-2">
      <div className="space-y-0.5">
        <div className="text-xs font-semibold">{task.title}</div>
        {contact && (
          <div className="text-[11px] text-gray-600">
            {contact.first_name || contact.last_name ? (
              <>
                {contact.first_name} {contact.last_name} —
              </>
            ) : null}
            {contact.email}
            {contact.city && ` · ${contact.city}`}
          </div>
        )}
        {due && (
          <div
            className={`text-[10px] ${
              overdue ? "text-red-500" : "text-gray-500"
            }`}
          >
            Due {due.toLocaleString()}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={completeTask}
          className="text-[11px] px-2 py-1 rounded-lg bg-black text-white"
        >
          Done
        </button>
        <button
          onClick={() => snoozeTask(60)}
          className="text-[10px] text-gray-500"
        >
          Snooze 1h
        </button>
      </div>
    </div>
  );
}



























































