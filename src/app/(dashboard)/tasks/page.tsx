"use client";

import { useState, useEffect } from "react";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskStats } from "@/components/tasks/TaskStats";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Task } from "@/app/api/tasks/route";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    assignedTo: "all" as "me" | "all" | string,
    status: "open" as "open" | "completed" | "all",
    priority: undefined as "low" | "normal" | "high" | undefined,
    due: undefined as "today" | "overdue" | undefined,
  });

  useEffect(() => {
    loadTasks();
  }, [filters]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.assignedTo !== "all") {
        params.append("assignedTo", filters.assignedTo);
      }
      if (filters.status !== "all") {
        params.append("status", filters.status);
      }
      if (filters.priority) {
        params.append("priority", filters.priority);
      }
      if (filters.due) {
        params.append("due", filters.due);
      }

      const res = await fetch(`/api/tasks?${params.toString()}`);
      const data = await res.json();
      setTasks(data.data || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskCreated = () => {
    setCreateModalOpen(false);
    loadTasks();
  };

  const handleTaskUpdated = () => {
    loadTasks();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track follow-ups and actions tied to your leads
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Task
        </Button>
      </div>

      <TaskStats tasks={tasks} />

      <TaskBoard
        tasks={tasks}
        loading={loading}
        filters={filters}
        onFiltersChange={setFilters}
        onTaskUpdate={handleTaskUpdated}
      />

      <CreateTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
}
