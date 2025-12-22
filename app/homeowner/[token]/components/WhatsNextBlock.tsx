"use client";

// Block 94000 — "What's Next?" Block (Clarity Engine)
// Shows homeowners exactly where they are in the journey and what's happening today

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle2, Circle } from "lucide-react";

type Milestone = {
  milestone_type: string;
  status: "pending" | "in_progress" | "completed";
  completed_at: string | null;
};

type CurrentMilestone = {
  milestone_type: string;
  status: string;
  completed_at: string | null;
};

interface WhatsNextBlockProps {
  currentMilestone: CurrentMilestone | null;
  allMilestones: Milestone[];
  jobStatus: string;
  scheduledDate?: string | null;
  crewName?: string | null;
}

const milestoneLabels: Record<string, string> = {
  estimate_scheduled: "Estimate Scheduled",
  crew_assigned: "Crew Assigned",
  materials_scheduled: "Materials Scheduled",
  install_day: "Installation Day",
  cleanup_complete: "Cleanup Complete",
  final_walkthrough: "Final Walkthrough",
};

const milestoneDescriptions: Record<string, string> = {
  estimate_scheduled: "Your estimate has been scheduled. We'll be in touch soon.",
  crew_assigned: "Your crew has been assigned and will contact you soon.",
  materials_scheduled: "Materials are being delivered. We'll notify you when they arrive.",
  install_day: "Installation is happening today. Our crew will be on-site.",
  cleanup_complete: "Cleanup is complete. Final walkthrough scheduled.",
  final_walkthrough: "Final walkthrough completed. Your project is finished!",
};

const getTodayInfo = (
  currentMilestone: CurrentMilestone | null,
  jobStatus: string,
  scheduledDate?: string | null,
  crewName?: string | null
) => {
  if (!currentMilestone) {
    return {
      title: "Getting Started",
      description: "We're preparing your project. You'll receive updates soon.",
    };
  }

  const { milestone_type, status } = currentMilestone;

  if (milestone_type === "install_day" && status === "in_progress") {
    return {
      title: crewName
        ? `${crewName} is on-site today`
        : "Crew is on-site today",
      description: scheduledDate
        ? `Installation is happening today. Expected completion: ${new Date(scheduledDate).toLocaleDateString()}`
        : "Installation is in progress. We'll keep you updated.",
    };
  }

  if (milestone_type === "materials_scheduled" && status === "in_progress") {
    return {
      title: "Materials Delivery",
      description: "Materials are being delivered. We'll notify you when they arrive.",
    };
  }

  if (milestone_type === "crew_assigned" && status === "in_progress") {
    return {
      title: crewName ? `Crew: ${crewName}` : "Crew Assigned",
      description: "Your crew has been assigned. They'll contact you to schedule installation.",
    };
  }

  return {
    title: milestoneLabels[milestone_type] || "Next Step",
    description: milestoneDescriptions[milestone_type] || "Your project is progressing.",
  };
};

const getNextStepInfo = (currentMilestone: CurrentMilestone | null, allMilestones: Milestone[]) => {
  if (!currentMilestone) {
    // Find first pending milestone
    const firstPending = allMilestones.find((m) => m.status === "pending");
    if (firstPending) {
      return {
        title: milestoneLabels[firstPending.milestone_type] || "Next Step",
        description: milestoneDescriptions[firstPending.milestone_type] || "Coming up next.",
      };
    }
    return null;
  }

  // Find next pending milestone after current
  const milestoneOrder = [
    "estimate_scheduled",
    "crew_assigned",
    "materials_scheduled",
    "install_day",
    "cleanup_complete",
    "final_walkthrough",
  ];

  const currentIndex = milestoneOrder.indexOf(currentMilestone.milestone_type);
  if (currentIndex === -1) return null;

  // Look for next pending milestone
  for (let i = currentIndex + 1; i < milestoneOrder.length; i++) {
    const nextType = milestoneOrder[i];
    const nextMilestone = allMilestones.find((m) => m.milestone_type === nextType);
    if (nextMilestone && nextMilestone.status === "pending") {
      return {
        title: milestoneLabels[nextType] || "Next Step",
        description: milestoneDescriptions[nextType] || "Coming up next.",
      };
    }
  }

  return null;
};

export function WhatsNextBlock({
  currentMilestone,
  allMilestones,
  jobStatus,
  scheduledDate,
  crewName,
}: WhatsNextBlockProps) {
  const todayInfo = getTodayInfo(currentMilestone, jobStatus, scheduledDate, crewName);
  const nextStepInfo = getNextStepInfo(currentMilestone, allMilestones);

  return (
    <div className="space-y-4">
      {/* TODAY Section */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Clock className="h-5 w-5" />
            TODAY
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <p className="font-semibold text-gray-900 text-lg">{todayInfo.title}</p>
            <p className="text-sm text-gray-700 mt-1">{todayInfo.description}</p>
          </div>
          {scheduledDate && milestoneLabels[currentMilestone?.milestone_type || ""] === "Installation Day" && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-gray-700">
                Scheduled: {new Date(scheduledDate).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* NEXT STEP Section */}
      {nextStepInfo && (
        <Card className="bg-gray-50 border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900 text-base">
              <CheckCircle2 className="h-4 w-4" />
              NEXT STEP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-gray-900">{nextStepInfo.title}</p>
            <p className="text-sm text-gray-600 mt-1">{nextStepInfo.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
