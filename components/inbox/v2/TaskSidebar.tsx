// Block 13900 — Smart Tasks v2 Task Sidebar Component
// Shows tasks for a selected thread/lead in the inbox

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, AlertCircle, Clock, Phone, Mail, Calendar } from "lucide-react";
import { Task } from "@/src/app/api/tasks/route";

type TaskSidebarProps = {
  threadId?: string;
  leadId?: string;
  contactId?: string;
};

const PRIORITY_COLORS = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
};

const TYPE_ICONS = {
  call: Phone,
  text: Phone,
  email: Mail,
  inspection: Calendar,
  follow_up: Clock,
  send_estimate: Calendar,
  re_engage: Clock,
  answer_question: AlertCircle,
  review_damage: AlertCircle,
  insurance_support: AlertCircle,
};

export function TaskSidebar({ threadId, leadId, contactId }: TaskSidebarProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!threadId && !leadId && !contactId) {
      setTasks([]);
      return;
    }

    async function loadTasks() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("status", "open");
        if (threadId) params.set("replyThreadId", threadId);
        if (leadId) params.set("leadId", leadId);
        if (contactId) params.set("contactId", contactId);

        const res = await fetch(`/api/tasks?${params.toString()}`);
        const json = await res.json();
        setTasks(json.data || []);
      } catch (error) {
        console.error("Error loading tasks:", error);
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, [threadId, leadId, contactId]);

  const handleCompleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", completed: true }),
      });

      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  if (!threadId && !leadId && !contactId) {
    return (
      <div className="w-80 flex-shrink-0 border-l bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Tasks</h3>
        <p className="text-xs text-gray-500">Select a thread to view tasks</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-80 flex-shrink-0 border-l bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Tasks</h3>
        <div className="text-xs text-gray-500">Loading...</div>
      </div>
    );
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    // Sort by priority (high first), then by due date
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const priorityDiff = (priorityOrder[b.priority as keyof typeof priorityOrder] || 0) - 
                         (priorityOrder[a.priority as keyof typeof priorityOrder] || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  const isOverdue = (dueAt: string) => {
    return new Date(dueAt) < new Date();
  };

  const formatDueDate = (dueAt: string) => {
    const date = new Date(dueAt);
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date < today) {
      return "Overdue";
    } else if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="w-80 flex-shrink-0 border-l bg-gray-50 flex flex-col">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold text-gray-700">Tasks</h3>
        <p className="text-xs text-gray-500 mt-1">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedTasks.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-8">
            No tasks for this lead
          </div>
        ) : (
          sortedTasks.map((task) => {
            const Icon = TYPE_ICONS[task.type as keyof typeof TYPE_ICONS] || Clock;
            const priorityColor = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;
            const overdue = isOverdue(task.dueAt);

            return (
              <div
                key={task.id}
                className={`border rounded-lg p-3 bg-white ${overdue ? "border-red-300" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${priorityColor}`}>
                        {task.priority === "high" ? "🔥" : task.priority === "medium" ? "⚠️" : "🟦"}
                      </span>
                      {task.autoGenerated && (
                        <span className="text-xs text-gray-400">Auto</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 font-medium mb-1 line-clamp-2">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span className={overdue ? "text-red-600 font-medium" : ""}>
                        {formatDueDate(task.dueAt)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCompleteTask(task.id)}
                    className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
                    title="Mark as complete"
                  >
                    <Circle className="h-4 w-4 text-gray-400 hover:text-green-600" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}





















































