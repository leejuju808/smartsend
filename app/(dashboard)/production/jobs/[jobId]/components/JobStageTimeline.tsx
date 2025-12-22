"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { format } from "date-fns";

interface JobStageTimelineProps {
  events: Array<{
    id: string;
    stage: string;
    changed_at: string;
    changed_by: string | null;
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  estimate: "Estimate Sent",
  approved: "Approved",
  insurance: "Insurance Processing",
  materials: "Materials Ordered",
  scheduled: "Scheduled for Install",
  in_progress: "In Progress",
  completed: "Completed",
};

export function JobStageTimeline({ events }: JobStageTimelineProps) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No stage changes yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {events.map((event, index) => (
            <div key={event.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                {index < events.length - 1 && (
                  <div className="w-px h-full bg-border min-h-[40px]" />
                )}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {STAGE_LABELS[event.stage] || event.stage}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{format(new Date(event.changed_at), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


































