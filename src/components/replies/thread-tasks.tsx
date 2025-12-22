"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { CreateTaskModal } from "@/components/tasks/create-task-modal";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
};

export function ThreadTasks({ threadId }: { threadId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (threadId) {
      loadTasks();
    }
  }, [threadId]);

  const loadTasks = async () => {
    try {
      const res = await fetch(`/api/tasks/list?thread_id=${threadId}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: "todo" | "in_progress" | "done") => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadTasks();
      }
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "done":
        return "default";
      case "in_progress":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading tasks...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Tasks</h3>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setCreateModalOpen(true)}
        >
          + Add Task
        </Button>
      </div>

      {tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      )}

      {tasks.map((task) => (
        <Card key={task.id} className="p-3">
          <CardContent className="p-0 space-y-2">
            <div className="flex justify-between items-start">
              <Badge variant={getStatusBadgeVariant(task.status)} className="text-xs">
                {task.status.replace("_", " ")}
              </Badge>
              <select
                value={task.status}
                onChange={(e) =>
                  handleStatusChange(task.id, e.target.value as "todo" | "in_progress" | "done")
                }
                className="text-xs border rounded px-2 py-1 bg-background"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <p className="font-medium text-sm">{task.title}</p>
            {task.description && (
              <p className="text-xs text-muted-foreground">{task.description}</p>
            )}
            {task.due_date && (
              <p className="text-xs text-muted-foreground">
                Due: {formatDate(task.due_date)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      <CreateTaskModal
        threadId={threadId}
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          loadTasks();
        }}
      />
    </div>
  );
}










