"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { JobHealthBadge } from "@/components/JobHealthBadge";
import Link from "next/link";
import { Clock, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface TodayJob {
  id: string;
  title: string;
  job_type: string;
  status: string;
  job_value: number;
  deposit_paid: number;
  crew_name: string | null;
  materials_confirmed: boolean | null;
  payment_status: string;
  health_score: number | null;
  health_status: string | null;
  schedule_status: string;
  issues_count: number;
  scheduled_start_date: string;
  scheduled_end_date: string | null;
}

interface TodayJobsPanelProps {
  jobs: TodayJob[];
}

export function TodayJobsPanel({ jobs }: TodayJobsPanelProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "on_schedule":
        return (
          <Badge variant="default" className="bg-green-500 text-white">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            ON SCHEDULE
          </Badge>
        );
      case "at_risk":
        return (
          <Badge variant="default" className="bg-yellow-500 text-white">
            <AlertTriangle className="w-3 h-3 mr-1" />
            AT RISK
          </Badge>
        );
      case "delayed":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            DELAYED
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="default" className="bg-blue-500 text-white">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            COMPLETED
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Today&apos;s Jobs</span>
          <Badge variant="secondary">{jobs.length} jobs</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No jobs scheduled for today</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="block p-4 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{job.title}</h3>
                      {getStatusBadge(job.schedule_status)}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {job.scheduled_end_date
                            ? `ETA: ${formatTime(job.scheduled_end_date)}`
                            : "No ETA"}
                        </span>
                      </div>

                      <div>
                        Crew: {job.crew_name || "Unassigned"}
                      </div>

                      <div>
                        Materials:{" "}
                        {job.materials_confirmed === true
                          ? "✓ Confirmed"
                          : job.materials_confirmed === false
                          ? "✗ Issue"
                          : "Pending"}
                      </div>

                      <div>
                        Payment: {job.payment_status.replace("_", " ")}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="font-medium">
                        Value: {formatCurrency(job.job_value)}
                      </div>
                      {job.health_score !== null && (
                        <JobHealthBadge
                          score={job.health_score}
                          variant="compact"
                        />
                      )}
                      {job.issues_count > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {job.issues_count} issue{job.issues_count > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}






































