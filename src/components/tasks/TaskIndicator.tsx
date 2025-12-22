"use client";

import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskIndicatorProps {
  openTasksCount?: number;
  overdueTasksCount?: number;
  dueTodayTasksCount?: number;
  allCompleted?: boolean;
  className?: string;
}

export function TaskIndicator({
  openTasksCount = 0,
  overdueTasksCount = 0,
  dueTodayTasksCount = 0,
  allCompleted = false,
  className,
}: TaskIndicatorProps) {
  // If all tasks completed, show checkmark
  if (allCompleted && openTasksCount === 0) {
    return (
      <div className={cn("flex items-center gap-1", className)} title="All tasks completed">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
      </div>
    );
  }

  // If overdue tasks exist, show red dot
  if (overdueTasksCount > 0) {
    return (
      <div className={cn("flex items-center gap-1", className)} title={`${overdueTasksCount} overdue task${overdueTasksCount > 1 ? 's' : ''}`}>
        <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
        {overdueTasksCount > 1 && (
          <span className="text-xs text-red-600 font-medium">{overdueTasksCount}</span>
        )}
      </div>
    );
  }

  // If tasks due today, show orange dot
  if (dueTodayTasksCount > 0) {
    return (
      <div className={cn("flex items-center gap-1", className)} title={`${dueTodayTasksCount} task${dueTodayTasksCount > 1 ? 's' : ''} due today`}>
        <div className="h-2 w-2 rounded-full bg-orange-500" />
        {dueTodayTasksCount > 1 && (
          <span className="text-xs text-orange-600 font-medium">{dueTodayTasksCount}</span>
        )}
      </div>
    );
  }

  // If open tasks exist, show small icon
  if (openTasksCount > 0) {
    return (
      <div className={cn("flex items-center gap-1", className)} title={`${openTasksCount} open task${openTasksCount > 1 ? 's' : ''}`}>
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        {openTasksCount > 1 && (
          <span className="text-xs text-muted-foreground">{openTasksCount}</span>
        )}
      </div>
    );
  }

  return null;
}



















































