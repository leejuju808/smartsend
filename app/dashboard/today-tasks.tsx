"use client";

import { useEffect, useState } from "react";

export default function TodayTasks() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/today");
      const data = await res.json();
      setTasks(data.tasks);
    }
    load();
  }, []);

  async function markDone(taskId: string) {
    const res = await fetch(`/api/today/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    if (res.ok) {
      // Remove task from list
      setTasks((prev) => prev.filter((t: any) => t.id !== taskId));
    }
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border">
      <h2 className="text-lg font-bold mb-3">Today's Tasks</h2>

      {tasks.length === 0 && (
        <p className="text-gray-500 text-sm">All caught up 🔥</p>
      )}

      {tasks.map((task: any) => (
        <div key={task.id} className="flex justify-between py-2 border-b">
          <div>
            <p className="font-medium">{task.title}</p>
            <p className="text-xs text-gray-500">{task.description || ""}</p>
          </div>
          <button
            onClick={() => markDone(task.id)}
            className="text-blue-600 text-sm hover:text-blue-800"
          >
            Mark done
          </button>
        </div>
      ))}
    </div>
  );
}

