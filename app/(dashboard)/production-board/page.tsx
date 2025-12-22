"use client";

// Block 90000 — SmartSend Roofing Production Board (Kanban View)
// Alternative view for production managers who prefer Kanban over calendar

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cloud,
  Truck,
  Wrench,
} from "lucide-react";
import { format, parseISO } from "date-fns";

type JobCard = {
  id: string;
  job_id: string;
  job_title: string;
  job_address: string;
  crew_id: string | null;
  crew_name: string | null;
  start_date: string;
  status: "ready_for_scheduling" | "scheduled" | "in_progress" | "weather_delay" | "completed";
  readiness: "ready" | "cutting_it_close" | "material_delayed" | "blocked_no_materials";
  flags: string[];
  weather_risk?: number;
};

type Column = {
  id: string;
  title: string;
  status: JobCard["status"];
  color: string;
};

const columns: Column[] = [
  {
    id: "ready_for_scheduling",
    title: "Ready for Scheduling",
    status: "ready_for_scheduling",
    color: "bg-blue-50 border-blue-200",
  },
  {
    id: "scheduled",
    title: "Scheduled",
    status: "scheduled",
    color: "bg-green-50 border-green-200",
  },
  {
    id: "in_progress",
    title: "In Progress",
    status: "in_progress",
    color: "bg-yellow-50 border-yellow-200",
  },
  {
    id: "weather_delay",
    title: "Weather Delay",
    status: "weather_delay",
    color: "bg-gray-50 border-gray-200",
  },
  {
    id: "completed",
    title: "Completed",
    status: "completed",
    color: "bg-purple-50 border-purple-200",
  },
];

function getReadinessColor(readiness: string): string {
  switch (readiness) {
    case "ready":
      return "text-green-600 bg-green-100";
    case "cutting_it_close":
      return "text-yellow-600 bg-yellow-100";
    case "material_delayed":
      return "text-orange-600 bg-orange-100";
    case "blocked_no_materials":
      return "text-red-600 bg-red-100";
    default:
      return "text-gray-600 bg-gray-100";
  }
}

function getReadinessIcon(readiness: string) {
  switch (readiness) {
    case "ready":
      return <CheckCircle2 className="h-4 w-4" />;
    case "cutting_it_close":
      return <Clock className="h-4 w-4" />;
    case "material_delayed":
      return <Truck className="h-4 w-4" />;
    case "blocked_no_materials":
      return <AlertCircle className="h-4 w-4" />;
    default:
      return null;
  }
}

export default function ProductionBoardPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<string>("all");

  // Get workspace ID
  useEffect(() => {
    fetch("/api/workspace/current")
      .then((r) => r.json())
      .then((data) => {
        if (data.workspace?.id) {
          setWorkspaceId(data.workspace.id);
        }
      })
      .catch(() => {
        const wsId = localStorage.getItem("workspace_id");
        if (wsId) setWorkspaceId(wsId);
      });
  }, []);

  // Fetch jobs
  useEffect(() => {
    if (!workspaceId) return;

    const fetchJobs = async () => {
      setLoading(true);
      try {
        // Get jobs ready for scheduling (from pipeline)
        const jobsRes = await fetch(`/api/jobs?workspace_id=${workspaceId}&status=approved`);
        const jobsData = await jobsRes.json();

        // Get scheduled jobs (from calendar events)
        const from = format(new Date(), "yyyy-MM-dd");
        const to = format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
        const eventsRes = await fetch(
          `/api/production-calendar/events?from=${from}&to=${to}&workspace_id=${workspaceId}`
        );
        const eventsData = await eventsRes.json();

        // Combine and format
        const jobCards: JobCard[] = [];

        // Add jobs ready for scheduling
        (jobsData.jobs || []).forEach((job: any) => {
          if (job.pipeline_stage === "approved" || job.status === "approved") {
            jobCards.push({
              id: `job-${job.id}`,
              job_id: job.id,
              job_title: job.title || `Job ${job.id.slice(0, 8)}`,
              job_address: job.address || "",
              crew_id: null,
              crew_name: null,
              start_date: "",
              status: "ready_for_scheduling",
              readiness: "ready",
              flags: [],
            });
          }
        });

        // Add scheduled jobs from calendar
        (eventsData.events || []).forEach((event: any) => {
          if (event.event_type === "install") {
            const existingIndex = jobCards.findIndex((j) => j.job_id === event.job_id);
            if (existingIndex >= 0) {
              jobCards[existingIndex] = {
                ...jobCards[existingIndex],
                crew_id: event.crew_id,
                crew_name: event.crew_name,
                start_date: event.start_time,
                status:
                  event.status === "in_progress"
                    ? "in_progress"
                    : event.status === "completed"
                    ? "completed"
                    : "scheduled",
              };
            } else {
              jobCards.push({
                id: `event-${event.id}`,
                job_id: event.job_id || "",
                job_title: event.job_title || event.title,
                job_address: event.job_address || "",
                crew_id: event.crew_id,
                crew_name: event.crew_name,
                start_date: event.start_time,
                status:
                  event.status === "in_progress"
                    ? "in_progress"
                    : event.status === "completed"
                    ? "completed"
                    : "scheduled",
                readiness: "ready",
                flags: [],
                weather_risk: event.weather_severity,
              });
            }
          }
        });

        setJobs(jobCards);
      } catch (error) {
        console.error("Error fetching jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [workspaceId]);

  // Filter jobs by crew
  const filteredJobs = jobs.filter((job) => {
    if (selectedCrew === "all") return true;
    if (selectedCrew === "unassigned") return !job.crew_id;
    return job.crew_id === selectedCrew;
  });

  // Group jobs by status
  const jobsByStatus = columns.reduce((acc, col) => {
    acc[col.status] = filteredJobs.filter((job) => job.status === col.status);
    return acc;
  }, {} as Record<string, JobCard[]>);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData("jobId", jobId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: JobCard["status"]) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("jobId");
    if (!jobId || !workspaceId) return;

    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === targetStatus) return;

    try {
      // Update job status
      if (targetStatus === "scheduled" && job.status === "ready_for_scheduling") {
        // Create calendar event
        const res = await fetch("/api/production-calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            job_id: job.job_id,
            event_type: "install",
            title: `Install: ${job.job_title}`,
            start_time: new Date().toISOString(),
            crew_id: job.crew_id || null,
          }),
        });

        if (!res.ok) throw new Error("Failed to schedule job");
      } else if (targetStatus === "completed") {
        // Update calendar event status
        const eventsRes = await fetch(
          `/api/production-calendar/events?from=${format(new Date(), "yyyy-MM-dd")}&to=${format(
            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            "yyyy-MM-dd"
          )}&workspace_id=${workspaceId}`
        );
        const eventsData = await eventsRes.json();
        const event = eventsData.events?.find((e: any) => e.job_id === job.job_id);

        if (event) {
          await fetch(`/api/production-calendar/events/${event.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
          });
        }
      }

      // Update local state
      setJobs(
        jobs.map((j) => (j.id === jobId ? { ...j, status: targetStatus } : j))
      );
    } catch (error) {
      console.error("Error updating job status:", error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Production Board</h1>
          <p className="text-gray-600 mt-1">
            Kanban view for production managers — drag jobs between stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedCrew} onValueChange={setSelectedCrew}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Crews</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading production board...</div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => {
            const columnJobs = jobsByStatus[column.status] || [];

            return (
              <div
                key={column.id}
                className={`flex-1 min-w-[280px] rounded-lg border-2 p-4 ${column.color}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.status)}
              >
                <div className="font-semibold text-lg mb-4 flex items-center justify-between">
                  <span>{column.title}</span>
                  <Badge variant="outline">{columnJobs.length}</Badge>
                </div>
                <div className="space-y-3">
                  {columnJobs.map((job) => (
                    <Card
                      key={job.id}
                      className="p-4 cursor-move hover:shadow-md transition-shadow bg-white"
                      draggable
                      onDragStart={(e) => handleDragStart(e, job.id)}
                    >
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">{job.job_title}</div>
                        {job.job_address && (
                          <div className="text-xs text-gray-600">{job.job_address}</div>
                        )}
                        {job.crew_name && (
                          <div className="text-xs text-gray-500">Crew: {job.crew_name}</div>
                        )}
                        {job.start_date && (
                          <div className="text-xs text-gray-500">
                            {format(parseISO(job.start_date), "MMM d, h:mm a")}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant="outline"
                            className={`${getReadinessColor(job.readiness)} text-xs`}
                          >
                            {getReadinessIcon(job.readiness)}
                            <span className="ml-1 capitalize">
                              {job.readiness.replace(/_/g, " ")}
                            </span>
                          </Badge>
                          {job.weather_risk && job.weather_risk > 50 && (
                            <Badge variant="outline" className="text-orange-600 bg-orange-100">
                              <Cloud className="h-3 w-3 mr-1" />
                              Weather {job.weather_risk}%
                            </Badge>
                          )}
                        </div>
                        {job.flags.length > 0 && (
                          <div className="mt-2 text-xs text-red-600">
                            {job.flags.map((flag, i) => (
                              <div key={i}>⚠️ {flag}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  {columnJobs.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-8">
                      No jobs in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



























