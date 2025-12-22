"use client";

// Block 22270 — SmartSend Roofing Proposal → Job Conversion Flow v1
// Jobs Pipeline Board
// Simple Kanban view showing jobs in Unscheduled → Scheduled → In Progress → Completed

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Calendar, Wrench, CheckCircle2 } from "lucide-react";

const STATUSES = ["unscheduled", "scheduled", "in_progress", "completed"];

const STATUS_LABELS: Record<string, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  unscheduled: Clock,
  scheduled: Calendar,
  in_progress: Wrench,
  completed: CheckCircle2,
};

interface Job {
  id: string;
  title: string | null;
  status: string;
  job_value: number;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  created_at: string;
}

export default function JobsBoardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      setLoading(true);
      const res = await fetch("/api/jobs/list");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setError(errorData.error || "Failed to load jobs");
        return;
      }
      const json = await res.json();
      setJobs(json.jobs || []);
    } catch (e) {
      console.error("Failed to load jobs", e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function updateJobStatus(jobId: string, newStatus: string) {
    setUpdating((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch("/api/jobs/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, status: newStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update job status");
      }

      // Update local state
      setJobs((prev) =>
        prev.map((job) => (job.id === jobId ? { ...job, status: newStatus } : job))
      );
    } catch (err: any) {
      console.error("Error updating job status:", err);
      alert(err.message || "Failed to update job status");
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const jobsByStatus: Record<string, Job[]> = {};
  STATUSES.forEach((s) => (jobsByStatus[s] = []));
  jobs.forEach((job) => {
    if (jobsByStatus[job.status]) {
      jobsByStatus[job.status].push(job);
    }
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Loading jobs…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-2">Jobs Pipeline</h1>
        <p className="text-sm text-gray-600">
          Only actions that matter: Book → Close. Everything else is system-handled.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUSES.map((status) => {
          const StatusIcon = STATUS_ICONS[status];
          const statusJobs = jobsByStatus[status] || [];
          const totalValue = statusJobs.reduce((sum, job) => sum + (job.job_value || 0), 0);

          return (
            <div key={status} className="bg-gray-50 border rounded-lg p-4 min-h-[400px]">
              <div className="flex justify-between items-center mb-4 pb-3 border-b">
                <div className="flex items-center gap-2">
                  <StatusIcon className="w-5 h-5 text-gray-600" />
                  <h2 className="font-semibold text-sm">{STATUS_LABELS[status]}</h2>
                </div>
                <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                  {statusJobs.length}
                </span>
              </div>

              {totalValue > 0 && (
                <div className="mb-3 pb-2 border-b">
                  <p className="text-xs text-gray-600">Total Value</p>
                  <p className="text-sm font-semibold text-green-700">
                    {formatCurrency(totalValue)}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {statusJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    onStatusChange={(newStatus) => updateJobStatus(job.id, newStatus)}
                    updating={updating.has(job.id)}
                    currentStatus={status}
                  />
                ))}

                {statusJobs.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400">
                    No jobs here yet.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface JobCardProps {
  job: Job;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string | null) => string | null;
  onStatusChange: (newStatus: string) => void;
  updating: boolean;
  currentStatus: string;
}

function JobCard({
  job,
  formatCurrency,
  formatDate,
  onStatusChange,
  updating,
  currentStatus,
}: JobCardProps) {
  const isCompleted = currentStatus === "completed";
  const isUnscheduled = currentStatus === "unscheduled";
  const actionLabel = isCompleted ? null : isUnscheduled ? "Book" : "Close";
  const nextStatus = isCompleted ? null : isUnscheduled ? "scheduled" : "completed";

  return (
    <Card className="bg-white rounded border p-3 shadow-sm hover:shadow-md transition-shadow">
      <p className="font-semibold text-sm truncate mb-2">
        {job.title || "Roof Job"}
      </p>
      <p className="text-xs text-gray-600 mb-2">
        Value: <span className="font-medium text-gray-900">{formatCurrency(job.job_value)}</span>
      </p>
      {job.scheduled_start_date && (
        <p className="text-xs text-gray-500 mb-2">
          Start: {formatDate(job.scheduled_start_date)}
        </p>
      )}
      {nextStatus && (
        <Button
          onClick={() => onStatusChange(nextStatus)}
          disabled={updating}
          size="xs"
          variant="outline"
          className="w-full mt-2 text-xs"
        >
          {updating ? "Updating…" : actionLabel}
        </Button>
      )}
    </Card>
  );
}







































