"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReplyThreadDetail } from "@/types/reply-inbox";

export function useReplyThread(threadId: string | null) {
  const [data, setData] = useState<ReplyThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!threadId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/inbox/replies/${threadId}`);
      if (!res.ok) {
        throw new Error(`Failed to load thread: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      console.error("Error loading thread:", err);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateThread = useCallback(
    async (updates: {
      status?: string;
      latestIntent?: string;
      assignedTo?: string | null;
      unread?: boolean;
    }) => {
      if (!threadId) return;

      try {
        const res = await fetch(`/api/inbox/replies/${threadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          throw new Error(`Failed to update thread: ${res.statusText}`);
        }

        // Reload thread data
        await load();
      } catch (err) {
        console.error("Error updating thread:", err);
        throw err;
      }
    },
    [threadId, load]
  );

  const createTask = useCallback(
    async (taskData: {
      title: string;
      description?: string;
      dueDate?: string;
      owner?: string;
    }) => {
      if (!threadId) return;

      try {
        const res = await fetch(`/api/inbox/replies/${threadId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskData),
        });

        if (!res.ok) {
          throw new Error(`Failed to create task: ${res.statusText}`);
        }

        return await res.json();
      } catch (err) {
        console.error("Error creating task:", err);
        throw err;
      }
    },
    [threadId]
  );

  return { data, loading, error, reload: load, updateThread, createTask };
}
