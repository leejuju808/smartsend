// Block 22112 — SmartSend Roofing Action Queue v2
// "The Estimator Daily Command Center"
// The page that tells every estimator EXACTLY what to do each day — in perfect order

"use client";

import React, { useEffect, useState } from "react";
import { ActionTaskCard } from "@/components/action-queue/ActionTaskCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { RefreshCw, Filter, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Task {
  id: string;
  lead_id: string;
  task_type: string;
  action_priority: number;
  action_category: string;
  next_action?: string;
  next_action_reason?: string;
  ai_message_draft?: string;
  due_at?: string;
  is_overdue?: boolean;
  hours_until_due?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  job_health_score?: number;
  job_health_trend?: string;
  momentum_score?: number;
  job_probability?: number;
  risk_category?: string;
  is_in_save_mode?: boolean;
  save_severity?: string;
  pipeline_stage?: string;
}

export default function ActionQueuePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groupedTasks, setGroupedTasks] = useState<{
    priority1: Task[];
    priority2: Task[];
    priority3: Task[];
  }>({
    priority1: [],
    priority2: [],
    priority3: [],
  });
  const [counts, setCounts] = useState({
    total: 0,
    priority1: 0,
    priority2: 0,
    priority3: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "assigned_to_me">("all");

  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (filter === "assigned_to_me") {
        params.append("assigned_to_me", "true");
      }

      const response = await fetch(`/api/action-queue?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const data = await response.json();
      setTasks(data.tasks || []);
      setGroupedTasks(data.grouped || { priority1: [], priority2: [], priority3: [] });
      setCounts(data.counts || { total: 0, priority1: 0, priority2: 0, priority3: 0 });
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTasks();
  };

  const handleComplete = async (taskId: string) => {
    try {
      const response = await fetch("/api/action-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, action: "complete" }),
      });

      if (!response.ok) {
        throw new Error("Failed to complete task");
      }

      // Refresh tasks
      await fetchTasks();
    } catch (error) {
      console.error("Error completing task:", error);
      alert("Failed to complete task. Please try again.");
    }
  };

  const handleSkip = async (taskId: string) => {
    try {
      const response = await fetch("/api/action-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, action: "skip" }),
      });

      if (!response.ok) {
        throw new Error("Failed to skip task");
      }

      // Refresh tasks
      await fetchTasks();
    } catch (error) {
      console.error("Error skipping task:", error);
      alert("Failed to skip task. Please try again.");
    }
  };

  const handleOpenJob = (leadId: string) => {
    router.push(`/leads/${leadId}`);
  };

  const handleSendMessage = (leadId: string, taskId: string) => {
    // Navigate to lead page with message composer open
    router.push(`/leads/${leadId}?compose=true`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading your action queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Action Queue v2
          </h1>
          <p className="text-sm text-muted-foreground">
            Here is EXACTLY what you must do today... in the exact order that makes your company the most money.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter(filter === "all" ? "assigned_to_me" : "all")}
          >
            <Filter className="h-4 w-4 mr-2" />
            {filter === "all" ? "All Tasks" : "My Tasks"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Tasks</div>
          <div className="text-2xl font-bold">{counts.total}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
          <div className="text-sm text-red-700 dark:text-red-400">Priority 1</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-500">
            {counts.priority1}
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
          <div className="text-sm text-yellow-700 dark:text-yellow-400">Priority 2</div>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-500">
            {counts.priority2}
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
          <div className="text-sm text-green-700 dark:text-green-400">Priority 3</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-500">
            {counts.priority3}
          </div>
        </div>
      </div>

      {/* Priority 1: High — Revenue Urgent */}
      {groupedTasks.priority1.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Badge className="bg-red-600 text-white">Priority 1</Badge>
              🔥 Revenue Urgent
            </h2>
            <Badge variant="outline">{groupedTasks.priority1.length} tasks</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedTasks.priority1.map((task) => (
              <ActionTaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onSkip={handleSkip}
                onOpenJob={handleOpenJob}
                onSendMessage={handleSendMessage}
              />
            ))}
          </div>
        </section>
      )}

      {/* Priority 2: Medium — Move the Job Forward */}
      {groupedTasks.priority2.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Badge className="bg-yellow-600 text-white">Priority 2</Badge>
              🎯 Move the Job Forward
            </h2>
            <Badge variant="outline">{groupedTasks.priority2.length} tasks</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedTasks.priority2.map((task) => (
              <ActionTaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onSkip={handleSkip}
                onOpenJob={handleOpenJob}
                onSendMessage={handleSendMessage}
              />
            ))}
          </div>
        </section>
      )}

      {/* Priority 3: Low — Clean Up & Prep */}
      {groupedTasks.priority3.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Badge className="bg-green-600 text-white">Priority 3</Badge>
              🟢 Clean Up & Prep
            </h2>
            <Badge variant="outline">{groupedTasks.priority3.length} tasks</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedTasks.priority3.map((task) => (
              <ActionTaskCard
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onSkip={handleSkip}
                onOpenJob={handleOpenJob}
                onSendMessage={handleSendMessage}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {counts.total === 0 && (
        <div className="text-center py-12 border rounded-lg">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
          <p className="text-muted-foreground mb-4">
            You have no pending tasks. Great work!
          </p>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}









































