"use client";

// Block 94000 — Journey Timeline Component
// Shows all milestones with checkmarks and current step highlighted

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Clock } from "lucide-react";

type Milestone = {
  milestone_type: string;
  status: "pending" | "in_progress" | "completed";
  completed_at: string | null;
};

interface JourneyTimelineProps {
  milestones: Milestone[];
}

const milestoneOrder = [
  "estimate_scheduled",
  "crew_assigned",
  "materials_scheduled",
  "install_day",
  "cleanup_complete",
  "final_walkthrough",
];

const milestoneLabels: Record<string, string> = {
  estimate_scheduled: "Estimate Scheduled",
  crew_assigned: "Crew Assigned",
  materials_scheduled: "Materials Scheduled",
  install_day: "Installation Day",
  cleanup_complete: "Cleanup Complete",
  final_walkthrough: "Final Walkthrough",
};

export function JourneyTimeline({ milestones }: JourneyTimelineProps) {
  // Create a map of milestones by type
  const milestoneMap = new Map<string, Milestone>();
  milestones.forEach((m) => {
    milestoneMap.set(m.milestone_type, m);
  });

  // Get all milestones in order
  const orderedMilestones = milestoneOrder.map((type) => {
    const milestone = milestoneMap.get(type);
    return milestone || {
      milestone_type: type,
      status: "pending" as const,
      completed_at: null,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Project Journey</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {orderedMilestones.map((milestone, index) => {
            const isCompleted = milestone.status === "completed";
            const isInProgress = milestone.status === "in_progress";
            const isPending = milestone.status === "pending";

            return (
              <div key={milestone.milestone_type} className="flex items-start gap-4">
                {/* Timeline Line */}
                {index < orderedMilestones.length - 1 && (
                  <div
                    className={`absolute left-5 top-8 w-0.5 h-12 ${
                      isCompleted ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}

                {/* Icon */}
                <div className="relative z-10 flex-shrink-0">
                  {isCompleted ? (
                    <div className="rounded-full bg-green-500 p-1.5">
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </div>
                  ) : isInProgress ? (
                    <div className="rounded-full bg-blue-500 p-1.5 animate-pulse">
                      <Clock className="h-5 w-5 text-white" />
                    </div>
                  ) : (
                    <div className="rounded-full bg-gray-200 p-1.5">
                      <Circle className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div
                  className={`flex-1 pb-6 ${
                    isInProgress ? "bg-blue-50 p-3 rounded-lg border border-blue-200" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p
                      className={`font-medium ${
                        isCompleted
                          ? "text-gray-900"
                          : isInProgress
                          ? "text-blue-900"
                          : "text-gray-500"
                      }`}
                    >
                      {milestoneLabels[milestone.milestone_type]}
                    </p>
                    {isCompleted && milestone.completed_at && (
                      <span className="text-xs text-gray-500">
                        {new Date(milestone.completed_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {isInProgress && (
                    <p className="text-sm text-blue-700 mt-1">In progress</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
