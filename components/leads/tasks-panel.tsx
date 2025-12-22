"use client";

import { useState } from "react";
import { CheckSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import useSWR from "swr";

// Simple date formatting fallback
function formatDistanceToNow(date: Date | string): string {
  try {
    const { formatDistanceToNow: fn } = require("date-fns");
    return fn(new Date(date), { addSuffix: true });
  } catch {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return then.toLocaleDateString();
  }
}

interface Task {
  id: string;
  lead_id: string;
  title: string;
  status?: string;
  due_at?: string | null;
  created_at: string;
}

interface TasksPanelProps {
  leadId: string;
  tasks: Task[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function TasksPanel({ leadId, tasks: initialTasks }: TasksPanelProps) {
  const { data, mutate } = useSWR(`/api/leads/${leadId}/tasks`, fetcher, {
    fallbackData: { tasks: initialTasks },
  });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const tasks = data?.tasks || initialTasks || [];

  async function createTask() {
    if (!newTaskTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle }),
      });
      if (res.ok) {
        setNewTaskTitle("");
        mutate();
      }
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setCreating(false);
    }
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "open" : "done";
    try {
      const res = await fetch(`/api/leads/${leadId}/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        mutate();
      }
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tasks</h2>
      </div>

      {/* Create Task */}
      <div className="flex gap-2">
        <Input
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              createTask();
            }
          }}
          placeholder="Add a task..."
          disabled={creating}
        />
        <Button onClick={createTask} disabled={creating || !newTaskTitle.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tasks List */}
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: Task) => {
            const isDone = task.status === "done";
            const timeAgo = formatDistanceToNow(new Date(task.created_at), {
              addSuffix: true,
            });

            return (
              <div
                key={task.id}
                className={`p-3 rounded-lg border flex items-start gap-3 ${
                  isDone ? "opacity-60 bg-muted/30" : "bg-card"
                }`}
              >
                <button
                  onClick={() => toggleTask(task.id, task.status || "open")}
                  className="mt-0.5"
                >
                  <CheckSquare
                    className={`h-5 w-5 ${
                      isDone
                        ? "text-green-600 fill-green-600"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      isDone ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {timeAgo}
                    </span>
                    {task.due_at && (
                      <Badge variant="outline" className="text-xs">
                        Due: {formatDistanceToNow(new Date(task.due_at), {
                          addSuffix: true,
                        })}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

