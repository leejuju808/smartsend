// Block 95000 — Hook for marking onboarding tasks complete
// Use this in individual onboarding step pages to mark tasks complete

import { useState } from "react";

export function useOnboardingTask() {
  const [loading, setLoading] = useState(false);

  const markTaskComplete = async (taskId: string, completed: boolean = true) => {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/task/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, completed }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }

      const data = await res.json();
      return data;
    } catch (error) {
      console.error("Error marking task complete:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return { markTaskComplete, loading };
}


























