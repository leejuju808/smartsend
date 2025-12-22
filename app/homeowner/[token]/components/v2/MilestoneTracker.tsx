"use client";

// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// Production Milestone Tracker Component

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, Package, Wrench, CheckSquare, Home } from "lucide-react";
import { format } from "date-fns";

interface Milestone {
  id: string;
  milestone: string;
  status: "not_started" | "in_progress" | "completed";
  completed_at: string | null;
}

interface MilestoneTrackerProps {
  milestones: Milestone[];
}

const MILESTONE_ICONS: Record<string, any> = {
  "Material delivery": Package,
  "Tear-off started": Wrench,
  "Tear-off completed": CheckSquare,
  "Decking repair": Wrench,
  "Underlayment installed": CheckSquare,
  "Shingles installed": Home,
  "Ridge installed": CheckSquare,
  "Final QC completed": CheckCircle2,
  "Clean-up completed": CheckCircle2,
};

export function MilestoneTracker({ milestones }: MilestoneTrackerProps) {
  // Default milestones if none exist
  const defaultMilestones = [
    "Material delivery",
    "Tear-off started",
    "Tear-off completed",
    "Decking repair",
    "Underlayment installed",
    "Shingles installed",
    "Ridge installed",
    "Final QC completed",
    "Clean-up completed",
  ];

  // Merge default milestones with existing ones
  const allMilestones = defaultMilestones.map((name) => {
    const existing = milestones.find((m) => m.milestone === name);
    return (
      existing || {
        id: name,
        milestone: name,
        status: "not_started" as const,
        completed_at: null,
      }
    );
  });

  const completedCount = allMilestones.filter(
    (m) => m.status === "completed"
  ).length;
  const progressPercent = (completedCount / allMilestones.length) * 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Production Milestones
          </CardTitle>
          <Badge variant="outline">
            {completedCount} of {allMilestones.length} complete
          </Badge>
        </div>
        <div className="mt-2">
          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {allMilestones.map((milestone, index) => {
            const Icon =
              MILESTONE_ICONS[milestone.milestone] || CheckCircle2;

            return (
              <div
                key={milestone.id}
                className="flex items-start gap-4 pb-4 border-b last:border-0"
              >
                <div className="flex-shrink-0 mt-1">
                  {milestone.status === "completed" ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : milestone.status === "in_progress" ? (
                    <Clock className="h-6 w-6 text-blue-600 animate-pulse" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p
                      className={`font-medium ${
                        milestone.status === "completed"
                          ? "text-green-700 line-through"
                          : milestone.status === "in_progress"
                          ? "text-blue-700"
                          : "text-gray-500"
                      }`}
                    >
                      {milestone.milestone}
                    </p>
                  </div>
                  {milestone.completed_at && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Completed on{" "}
                      {format(
                        new Date(milestone.completed_at),
                        "MMM d, yyyy 'at' h:mm a"
                      )}
                    </p>
                  )}
                  {milestone.status === "in_progress" && (
                    <p className="text-sm text-blue-600 mt-1">
                      In progress...
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <Badge
                    variant={
                      milestone.status === "completed"
                        ? "default"
                        : milestone.status === "in_progress"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {milestone.status === "completed"
                      ? "Done"
                      : milestone.status === "in_progress"
                      ? "In Progress"
                      : "Pending"}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}




























