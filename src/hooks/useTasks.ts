"use client";

import { useCallback, useEffect, useState } from "react";
import { Task, CreateTaskInput, UpdateTaskInput } from "@/app/api/tasks/route";

export type TaskFilters = {
  status?: "open" | "completed" | "all";
  assignedTo?: "me" | "all";
  dateRange?: "today" | "week" | "all";
};

export type TasksResponse = {
  data: Task[];
  grouped: {
    overdue: Task[];
    today: Task[];
    tomorrow: Task[];
    thisWeek: Task[];
    later: Task[];
  };
  pagination: {
    cursor: string | null;
    limit: number;
    hasMore: boolean;
  };
};

export function useTasks(filters: TaskFilters = {}) {
  const [data, setData] = useState<TasksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();

    if (filters.status) params.set("status", filters.status);
    if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
    if (filters.dateRange) params.set("dateRange", filters.dateRange);

    const qs = params.toString();
    const url = qs ? `/api/tasks?${qs}` : "/api/tasks";

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load tasks: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      console.error("Error loading tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.assignedTo, filters.dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

export function useCreateTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createTask = useCallback(async (input: CreateTaskInput): Promise<Task | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to create task: ${res.statusText}`);
      }

      const json = await res.json();
      return json.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      console.error("Error creating task:", err);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createTask, loading, error };
}

export function useUpdateTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateTask = useCallback(async (taskId: string, input: UpdateTaskInput): Promise<Task | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to update task: ${res.statusText}`);
      }

      const json = await res.json();
      return json.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      console.error("Error updating task:", err);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { updateTask, loading, error };
}

export function useDeleteTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to delete task: ${res.statusText}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
      console.error("Error deleting task:", err);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deleteTask, loading, error };
}





























































