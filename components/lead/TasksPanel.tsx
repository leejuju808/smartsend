"use client";

import { useState } from "react";

export function TasksPanel({ tasks, leadId }: { tasks: any[]; leadId: string }) {
  const [completingId, setCompletingId] = useState<string | null>(null);

  const handleComplete = async (taskId: string) => {
    setCompletingId(taskId);
    try {
      // Try PATCH with status first (for lead_tasks)
      let res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      
      // If that fails, try with completed field (for tasks table)
      if (!res.ok) {
        res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: true, completed_at: new Date().toISOString() }),
        });
      }
      
      if (res.ok) {
        // Reload the page to refresh data
        window.location.reload();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to complete task:", errorData);
        alert("Failed to complete task. Please try again.");
      }
    } catch (err) {
      console.error("Error completing task:", err);
      alert("Error completing task. Please try again.");
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl border space-y-3">
      <h2 className="text-lg font-semibold">Tasks</h2>

      {tasks.length === 0 && (
        <p className="text-sm text-gray-500">No tasks for this lead.</p>
      )}

      {tasks.map((t) => (
        <div key={t.id} className="flex justify-between p-2 bg-gray-50 rounded">
          <div>
            <div className="font-medium">{t.title}</div>
            <div className="text-xs text-gray-500">
              Due {t.due_date || t.due_at ? new Date(t.due_date || t.due_at).toLocaleDateString() : "unknown"}
            </div>
          </div>
          {!t.completed && (
            <button
              onClick={() => handleComplete(t.id)}
              disabled={completingId === t.id}
              className="text-xs text-blue-600 underline disabled:opacity-50"
            >
              {completingId === t.id ? "Completing..." : "Complete"}
            </button>
          )}
          {t.completed && (
            <span className="text-xs text-green-600">Completed</span>
          )}
        </div>
      ))}
    </div>
  );
}

