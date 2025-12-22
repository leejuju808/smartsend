"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Users, AlertTriangle } from "lucide-react";

interface CrewLoad {
  crew_id: string;
  crew_name: string;
  is_active: boolean;
  jobs_today: number;
  today_jobs: any[];
  load_status: string;
  avg_health_score: number | null;
}

interface CrewLoadPanelProps {
  crews: CrewLoad[];
}

export function CrewLoadPanel({ crews }: CrewLoadPanelProps) {
  const getLoadBadge = (status: string) => {
    switch (status) {
      case "idle":
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-700">
            Idle
          </Badge>
        );
      case "balanced":
        return (
          <Badge variant="default" className="bg-green-500 text-white">
            Balanced
          </Badge>
        );
      case "busy":
        return (
          <Badge variant="default" className="bg-yellow-500 text-white">
            Busy
          </Badge>
        );
      case "overloaded":
        return (
          <Badge variant="destructive">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Overloaded
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Crew Load & Assignments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {crews.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No active crews</p>
          </div>
        ) : (
          <div className="space-y-4">
            {crews.map((crew) => (
              <div
                key={crew.crew_id}
                className="p-4 border rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{crew.crew_name}</div>
                  {getLoadBadge(crew.load_status)}
                </div>

                <div className="text-sm text-muted-foreground">
                  {crew.jobs_today === 0 ? (
                    <span>No jobs assigned today</span>
                  ) : (
                    <span>
                      {crew.jobs_today} job{crew.jobs_today > 1 ? "s" : ""}{" "}
                      today
                    </span>
                  )}
                </div>

                {crew.avg_health_score !== null && (
                  <div className="text-xs text-muted-foreground">
                    Avg Health Score: {Math.round(crew.avg_health_score)}
                  </div>
                )}

                {crew.load_status === "idle" && (
                  <div className="text-xs text-blue-600 italic">
                    Suggested: assign to inspection overflow
                  </div>
                )}

                {crew.load_status === "overloaded" && (
                  <div className="text-xs text-red-600 italic">
                    Suggested: reschedule some jobs
                  </div>
                )}

                {crew.today_jobs && crew.today_jobs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {crew.today_jobs.slice(0, 3).map((job: any, idx: number) => (
                      <div
                        key={idx}
                        className="text-xs text-muted-foreground pl-2 border-l-2"
                      >
                        {job.job_title || "Untitled Job"} - Health:{" "}
                        {job.health_score ? Math.round(job.health_score) : "N/A"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}






































