"use client";

// Block 246000 — Job Pipeline View (Super Visual Kanban)
// Columns: Not Scheduled, Scheduled, Awaiting Materials, In Progress, Delayed, Completed, Needs Walkthrough, Ready for Billing

import { useState } from "react";
import { 
  Calendar, 
  Package, 
  Wrench, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  DollarSign,
  Cloud,
  AlertCircle
} from "lucide-react";
import Link from "next/link";

interface Job {
  id: string;
  title: string;
  address: string;
  status: string;
  job_value: number;
  scheduled_start_date: string | null;
  crew_id: string | null;
  crews?: {
    id: string;
    name: string;
    foreman_name: string | null;
  } | null;
  job_alerts?: any[];
  job_dependencies?: any[];
}

interface JobPipelineViewProps {
  jobs: {
    all: Job[];
    byStage: {
      not_scheduled: Job[];
      scheduled: Job[];
      awaiting_materials: Job[];
      in_progress: Job[];
      delayed: Job[];
      completed: Job[];
      needs_walkthrough: Job[];
      ready_for_billing: Job[];
    };
  };
  onJobUpdate: () => void;
}

const STAGES = [
  { 
    id: 'not_scheduled', 
    label: 'Not Scheduled', 
    icon: Calendar, 
    color: 'bg-zinc-700',
    jobs: [] as Job[]
  },
  { 
    id: 'scheduled', 
    label: 'Scheduled', 
    icon: Calendar, 
    color: 'bg-blue-600',
    jobs: [] as Job[]
  },
  { 
    id: 'awaiting_materials', 
    label: 'Awaiting Materials', 
    icon: Package, 
    color: 'bg-orange-600',
    jobs: [] as Job[]
  },
  { 
    id: 'in_progress', 
    label: 'In Progress', 
    icon: Wrench, 
    color: 'bg-green-600',
    jobs: [] as Job[]
  },
  { 
    id: 'delayed', 
    label: 'Delayed (Risk)', 
    icon: AlertTriangle, 
    color: 'bg-red-600',
    jobs: [] as Job[]
  },
  { 
    id: 'completed', 
    label: 'Completed', 
    icon: CheckCircle, 
    color: 'bg-gray-600',
    jobs: [] as Job[]
  },
  { 
    id: 'needs_walkthrough', 
    label: 'Needs Walkthrough', 
    icon: Eye, 
    color: 'bg-purple-600',
    jobs: [] as Job[]
  },
  { 
    id: 'ready_for_billing', 
    label: 'Ready for Billing', 
    icon: DollarSign, 
    color: 'bg-emerald-600',
    jobs: [] as Job[]
  },
];

export function JobPipelineView({ jobs, onJobUpdate }: JobPipelineViewProps) {
  const [draggedJob, setDraggedJob] = useState<string | null>(null);

  // Map jobs to stages
  const stagesWithJobs = STAGES.map(stage => ({
    ...stage,
    jobs: jobs.byStage[stage.id as keyof typeof jobs.byStage] || []
  }));

  const handleDragStart = (jobId: string) => {
    setDraggedJob(jobId);
  };

  const handleDrop = async (jobId: string, newStage: string) => {
    if (!jobId || !newStage) return;

    // Determine new status based on stage
    const statusMap: Record<string, string> = {
      'not_scheduled': 'unscheduled',
      'scheduled': 'scheduled',
      'in_progress': 'in_progress',
      'completed': 'completed',
    };

    const newStatus = statusMap[newStage] || jobs.all.find(j => j.id === jobId)?.status;

    try {
      await fetch("/api/production/job/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          status: newStatus,
        }),
      });

      onJobUpdate();
    } catch (error) {
      console.error("Failed to update job status:", error);
    }

    setDraggedJob(null);
  };

  const getJobRiskColor = (job: Job) => {
    const alerts = job.job_alerts || [];
    const criticalAlerts = alerts.filter((a: any) => a.severity === 'critical' && !a.is_resolved);
    const warningAlerts = alerts.filter((a: any) => a.severity === 'warning' && !a.is_resolved);
    
    if (criticalAlerts.length > 0) return 'border-red-500 bg-red-500/5';
    if (warningAlerts.length > 0) return 'border-yellow-500 bg-yellow-500/5';
    return 'border-zinc-700 bg-zinc-900/50';
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Job Pipeline</h2>
        <div className="text-xs text-zinc-400">
          {jobs.all.length} total jobs
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-4 min-w-max pb-4">
          {stagesWithJobs.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-72"
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const jobId = e.dataTransfer.getData("jobId");
                  if (jobId) {
                    handleDrop(jobId, stage.id);
                  }
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className={`${stage.color} rounded p-1.5`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-300">{stage.label}</h3>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                    {stage.jobs.length}
                  </span>
                </div>

                <div className="space-y-2 min-h-[200px]">
                  {stage.jobs.map((job) => (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={() => handleDragStart(job.id)}
                      className={`${getJobRiskColor(job)} border rounded-lg p-3 cursor-move hover:border-zinc-600 transition-colors`}
                    >
                      <Link href={`/production/jobs/${job.id}`}>
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-white text-sm truncate">
                                {job.title || job.address || "Untitled Job"}
                              </div>
                              {job.address && (
                                <div className="text-xs text-zinc-400 truncate mt-1">
                                  {job.address}
                                </div>
                              )}
                            </div>
                            {job.job_alerts && job.job_alerts.length > 0 && (
                              <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 ml-2" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            {job.crews && (
                              <span className="text-zinc-400">
                                Crew: {job.crews.name}
                              </span>
                            )}
                            {job.scheduled_start_date && (
                              <span className="text-zinc-500">
                                • {new Date(job.scheduled_start_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-green-400">
                              {formatCurrency(job.job_value)}
                            </span>
                            {job.job_dependencies && job.job_dependencies.length > 0 && (
                              <span className="text-xs text-zinc-500">
                                {job.job_dependencies.filter((d: any) => d.status !== 'completed').length} deps
                              </span>
                            )}
                          </div>

                          {job.job_alerts && job.job_alerts.length > 0 && (
                            <div className="flex gap-1 mt-2">
                              {job.job_alerts
                                .filter((a: any) => !a.is_resolved)
                                .slice(0, 3)
                                .map((alert: any) => (
                                  <span
                                    key={alert.id}
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      alert.severity === 'critical'
                                        ? 'bg-red-500/20 text-red-400'
                                        : alert.severity === 'warning'
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-blue-500/20 text-blue-400'
                                    }`}
                                  >
                                    {alert.type}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </div>
                  ))}

                  {stage.jobs.length === 0 && (
                    <div className="text-center text-zinc-500 text-sm py-8 border-2 border-dashed border-zinc-800 rounded-lg">
                      No jobs
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

























