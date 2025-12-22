"use client";

import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";

export type JobStage =
  | "NEW_LEAD"
  | "CLAIM_FILED"
  | "ADJUSTER_SCHEDULED"
  | "CLAIM_PENDING"
  | "CLAIM_APPROVED"
  | "INSTALL_READY"
  | "SCHEDULED_INSTALL"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "LOST"
  | "NOT_A_FIT"
  | null;

interface JobStageFiltersProps {
  selectedStage: JobStage;
  onStageChange: (stage: JobStage) => void;
  counts?: Record<string, number>;
}

const JOB_STAGES: { value: JobStage; label: string }[] = [
  { value: "NEW_LEAD", label: "New Lead" },
  { value: "CLAIM_FILED", label: "Claim Filed" },
  { value: "ADJUSTER_SCHEDULED", label: "Adjuster Scheduled" },
  { value: "CLAIM_PENDING", label: "Claim Pending" },
  { value: "CLAIM_APPROVED", label: "Claim Approved" },
  { value: "INSTALL_READY", label: "Install Ready" },
  { value: "SCHEDULED_INSTALL", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "LOST", label: "Lost" },
  { value: "NOT_A_FIT", label: "Not A Fit" },
];

export function JobStageFilters({
  selectedStage,
  onStageChange,
  counts = {},
}: JobStageFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium" style={{ color: colors.inkSecondary }}>
        Job Stage:
      </span>
      <button
        onClick={() => onStageChange(null)}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-all",
          "hover:scale-105 active:scale-95"
        )}
        style={{
          backgroundColor: selectedStage === null ? colors.primary : colors.neutralLight,
          color: selectedStage === null ? colors.white : colors.inkSecondary,
        }}
      >
        All
      </button>
      {JOB_STAGES.map((stage) => {
        const count = counts[stage.value] || 0;
        const isActive = selectedStage === stage.value;
        
        return (
          <button
            key={stage.value}
            onClick={() => onStageChange(stage.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              "hover:scale-105 active:scale-95 flex items-center gap-1.5"
            )}
            style={{
              backgroundColor: isActive ? colors.primary : colors.neutralLight,
              color: isActive ? colors.white : colors.inkSecondary,
            }}
          >
            {stage.label}
            {count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  isActive ? "bg-white/20" : "bg-black/10"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
















































