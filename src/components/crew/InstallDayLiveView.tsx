"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, MapPin, Camera, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { format } from "date-fns";

interface InstallDayStatus {
  job_id: string;
  assigned_crew: {
    crew_id: string;
    crew_name: string;
    leader_phone: string;
  } | null;
  latest_checkin: {
    status: string;
    checked_in_at: string;
    notes: string | null;
  } | null;
  timeline: Array<{
    milestone: string;
    milestone_at: string;
    progress_percent: number | null;
  }>;
  photos_count: number;
  material_verified: boolean | null;
  homeowner_updates_sent: number;
}

interface InstallDayLiveViewProps {
  jobId: string;
  refreshInterval?: number; // in milliseconds
}

const statusLabels: Record<string, string> = {
  on_the_way: "On the Way",
  arrived: "Arrived",
  in_progress: "In Progress",
  lunch: "Lunch Break",
  completed: "Completed",
};

const milestoneLabels: Record<string, string> = {
  crew_arrival: "Crew Arrived",
  tear_off_start: "Tear-Off Started",
  tear_off_complete: "Tear-Off Complete",
  underlayment_start: "Underlayment Started",
  underlayment_complete: "Underlayment Complete",
  shingling_start: "Shingling Started",
  shingling_complete: "Shingling Complete",
  cleanup_start: "Cleanup Started",
  cleanup_complete: "Cleanup Complete",
  job_complete: "Job Complete",
};

export function InstallDayLiveView({ jobId, refreshInterval = 30000 }: InstallDayLiveViewProps) {
  const [status, setStatus] = useState<InstallDayStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStatus = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/install-day-status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
      }
    } catch (error) {
      console.error("Error loading install day status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    if (refreshInterval > 0) {
      const interval = setInterval(loadStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [jobId, refreshInterval]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">No install day data available</p>
        </CardContent>
      </Card>
    );
  }

  const latestProgress = status.timeline[status.timeline.length - 1]?.progress_percent || 0;
  const currentStatus = status.latest_checkin?.status || "not_started";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Install Day Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Crew Info */}
          {status.assigned_crew && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div>
                <p className="text-sm font-medium">{status.assigned_crew.crew_name}</p>
                <p className="text-xs text-muted-foreground">
                  {status.assigned_crew.leader_phone}
                </p>
              </div>
              <Badge
                variant={
                  currentStatus === "completed"
                    ? "default"
                    : currentStatus === "in_progress"
                    ? "default"
                    : "secondary"
                }
              >
                {statusLabels[currentStatus] || "Not Started"}
              </Badge>
            </div>
          )}

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm text-muted-foreground">{latestProgress}%</span>
            </div>
            <Progress value={latestProgress} className="h-2" />
          </div>

          {/* Latest Check-In */}
          {status.latest_checkin && (
            <div className="p-3 border rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Latest Update</span>
              </div>
              <p className="text-sm">
                {statusLabels[status.latest_checkin.status]} at{" "}
                {format(new Date(status.latest_checkin.checked_in_at), "h:mm a")}
              </p>
              {status.latest_checkin.notes && (
                <p className="text-xs text-muted-foreground mt-1">
                  {status.latest_checkin.notes}
                </p>
              )}
            </div>
          )}

          {/* Material Verification */}
          <div className="flex items-center gap-2 p-3 border rounded-md">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1">Materials</span>
            {status.material_verified === true ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            ) : status.material_verified === false ? (
              <Badge variant="destructive">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Verified
              </Badge>
            ) : (
              <Badge variant="secondary">Pending</Badge>
            )}
          </div>

          {/* Photos Count */}
          <div className="flex items-center gap-2 p-3 border rounded-md">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1">Progress Photos</span>
            <Badge variant="secondary">{status.photos_count}</Badge>
          </div>

          {/* Homeowner Updates */}
          <div className="flex items-center gap-2 p-3 border rounded-md">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1">Homeowner Updates Sent</span>
            <Badge variant="secondary">{status.homeowner_updates_sent}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {status.timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.timeline.map((entry, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                    {index < status.timeline.length - 1 && (
                      <div className="w-px h-8 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-sm font-medium">
                      {milestoneLabels[entry.milestone] || entry.milestone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.milestone_at), "h:mm a")}
                    </p>
                    {entry.progress_percent !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {entry.progress_percent}% complete
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

































