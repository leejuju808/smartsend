"use client";

// Block 22750 — SmartSend Roofing Field App v1
// Field Today Page — Shows Today's Jobs for Crew
// /field/today

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

type Job = {
  id: string;
  title: string;
  status: string;
  job_value: number;
  scheduled_start_date: string;
  scheduled_end_date: string | null;
  progress_percent: number | null;
  active_session: {
    id: string;
    check_in_at: string;
  } | null;
  crew: {
    id: string;
    name: string;
    color: string;
  } | null;
};

export default function FieldTodayPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTodayJobs();
  }, []);

  const fetchTodayJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/field/today");
      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (err: any) {
      setError(err.message || "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            <p className="mt-4 text-sm text-zinc-400">Loading today's jobs...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-400">{error}</p>
            <Button onClick={fetchTodayJobs} className="mt-4" variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Today's Jobs</h1>
        <p className="text-sm text-zinc-400">
          {jobs.length === 0
            ? "No jobs scheduled for today"
            : `${jobs.length} job${jobs.length === 1 ? "" : "s"} scheduled`}
        </p>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">No jobs scheduled for today</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:border-zinc-600 transition-colors"
              onClick={() => router.push(`/field/job/${job.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{job.title}</CardTitle>
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(job.scheduled_start_date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-zinc-300">
                          {formatCurrency(job.job_value)}
                        </span>
                      </div>
                      {job.crew && (
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: job.crew.color || "#71717a",
                            color: job.crew.color || "#71717a",
                          }}
                        >
                          {job.crew.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {job.active_session ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Checked In
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-zinc-600 text-zinc-400">
                        <Circle className="h-3 w-3 mr-1" />
                        Not Started
                      </Badge>
                    )}
                    {job.progress_percent !== null && (
                      <div className="text-xs text-zinc-500">
                        {job.progress_percent}% complete
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              {job.active_session && (
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Clock className="h-4 w-4" />
                    <span>Checked in at {formatTime(job.active_session.check_in_at)}</span>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}







































