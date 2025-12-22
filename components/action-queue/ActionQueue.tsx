// Block 21900 — SmartSend Roofing Action Queue Component v1
// "Do This Next" List for Owners & Estimators

"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle, Phone, Mail, Calendar, FileText, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

type ActionQueueTask = {
  id: string;
  task_type: string;
  priority: number;
  status: string;
  due_at: string | null;
  created_at: string;
  source: string | null;
  metadata: Record<string, any>;
  lead: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    status: string;
    pipeline_stage: string;
    heat_score: number | null;
    job_probability: number | null;
    risk_category: string | null;
    estimated_job_value: number | null;
  };
};

type ActionQueueProps = {
  assignedTo?: "me" | "all";
  limit?: number;
};

export function ActionQueue({ assignedTo = "me", limit = 50 }: ActionQueueProps) {
  const [tasks, setTasks] = useState<ActionQueueTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTasks = async () => {
    try {
      const res = await fetch(`/api/action-queue?status=open&assignedTo=${assignedTo}&limit=${limit}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load tasks");
      }

      setTasks(data.tasks || []);
    } catch (error: any) {
      console.error("Error loading action queue:", error);
      toast.error(error.message || "Failed to load action queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [assignedTo, limit]);

  const handleMarkDone = async (taskId: string) => {
    try {
      const res = await fetch(`/api/action-queue/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to mark task as done");
      }

      // Remove task from list
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success("Task marked as done");
    } catch (error: any) {
      console.error("Error marking task as done:", error);
      toast.error(error.message || "Failed to mark task as done");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Trigger queue rebuild
    try {
      const res = await fetch("/api/action-queue", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to rebuild queue");
      }
      // Reload tasks after rebuild
      await loadTasks();
      toast.success("Action queue refreshed");
    } catch (error: any) {
      console.error("Error refreshing queue:", error);
      toast.error("Failed to refresh queue");
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-8 bg-gray-200 rounded animate-pulse" />
        <div className="h-20 bg-gray-200 rounded animate-pulse" />
        <div className="h-20 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  const openTasks = tasks.filter((t) => t.status === "open").sort((a, b) => a.priority - b.priority);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">My Action Queue</h2>
          <p className="text-sm text-gray-400">
            Sorted by money impact and urgency. Start from the top and work down.
          </p>
        </div>
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

      {openTasks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No open actions.</p>
          <p className="text-xs mt-1">SmartSend will add more as leads change.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {openTasks.map((task) => (
            <ActionQueueItem key={task.id} task={task} onMarkDone={handleMarkDone} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionQueueItem({
  task,
  onMarkDone,
}: {
  task: ActionQueueTask;
  onMarkDone: (taskId: string) => void;
}) {
  const badge = typeToLabel(task.task_type);
  const leadName = task.lead.first_name || task.lead.last_name
    ? `${task.lead.first_name || ""} ${task.lead.last_name || ""}`.trim()
    : task.lead.email;

  return (
    <div className="flex items-start justify-between p-4 rounded-xl bg-black/30 border border-white/10 shadow-sm hover:border-white/20 transition-colors">
      <div className="flex-1 flex items-start gap-3">
        <div className="mt-1">{badge.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">{badge.title}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
              Priority #{task.priority}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{badge.subtitle}</p>
          <Link
            href={`/leads/${task.lead.id}`}
            className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
          >
            {leadName}
          </Link>
          {task.lead.heat_score !== null && (
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              {task.lead.heat_score >= 80 && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-yellow-400" />
                  Heat: {task.lead.heat_score}
                </span>
              )}
              {task.lead.job_probability !== null && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-green-400" />
                  {task.lead.job_probability}% prob
                </span>
              )}
              {task.lead.risk_category === "critical" && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Critical Risk
                </span>
              )}
            </div>
          )}
          {task.metadata?.reason && (
            <p className="text-xs text-gray-500 mt-2">Reason: {task.metadata.reason}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 ml-4">
        {task.due_at && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3 w-3" />
            <span>
              {new Date(task.due_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-xs px-3 py-1 border-green-400 text-green-400 hover:bg-green-400/10"
          onClick={() => onMarkDone(task.id)}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Mark Done
        </Button>
      </div>
    </div>
  );
}

function typeToLabel(type: string): { title: string; subtitle: string; icon: JSX.Element } {
  const icons = {
    follow_up_hot: <Zap className="h-5 w-5 text-yellow-400" />,
    follow_up_warm: <Mail className="h-5 w-5 text-blue-400" />,
    send_proposal: <FileText className="h-5 w-5 text-purple-400" />,
    save_critical_risk_job: <AlertCircle className="h-5 w-5 text-red-400" />,
    reply_to_angry_homeowner: <AlertCircle className="h-5 w-5 text-red-400" />,
    book_estimate: <Calendar className="h-5 w-5 text-green-400" />,
    review_stuck_job: <Clock className="h-5 w-5 text-orange-400" />,
    owner_review_high_value: <TrendingUp className="h-5 w-5 text-blue-400" />,
    resurrection_follow_up: <RefreshCw className="h-5 w-5 text-gray-400" />,
    call_homeowner: <Phone className="h-5 w-5 text-green-400" />,
  };

  const labels: Record<string, { title: string; subtitle: string }> = {
    follow_up_hot: {
      title: "Follow Up With Hot Lead",
      subtitle: "High heat score, no recent contact.",
    },
    follow_up_warm: {
      title: "Follow Up With Warm Lead",
      subtitle: "Warm lead needs attention.",
    },
    send_proposal: {
      title: "Send Proposal",
      subtitle: "Estimate complete. Proposal needs to go out.",
    },
    save_critical_risk_job: {
      title: "Save At-Risk Job",
      subtitle: "Critical risk — act now.",
    },
    reply_to_angry_homeowner: {
      title: "Respond to Upset Homeowner",
      subtitle: "Tone flagged as angry.",
    },
    book_estimate: {
      title: "Book Estimate",
      subtitle: "They're interested but not scheduled.",
    },
    review_stuck_job: {
      title: "Review Stuck Job",
      subtitle: "High-probability job stuck in pipeline.",
    },
    owner_review_high_value: {
      title: "Owner Review High-Value Job",
      subtitle: "High-value job needs owner attention.",
    },
    resurrection_follow_up: {
      title: "Revive Old Lead",
      subtitle: "Ghosted or past customer opportunity.",
    },
    call_homeowner: {
      title: "Call Homeowner",
      subtitle: "Call this lead ASAP.",
    },
  };

  return {
    ...labels[type] || { title: "Take Action", subtitle: type },
    icon: icons[type as keyof typeof icons] || <Clock className="h-5 w-5 text-gray-400" />,
  };
}









































