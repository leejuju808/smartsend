"use client";

import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";

export type ClaimStatus =
  | "no_claim_filed"
  | "claim_filed_awaiting_adjuster"
  | "adjuster_visit_scheduled"
  | "under_review"
  | "approved"
  | "approved_acv_only"
  | "supplements_needed"
  | "denied"
  | null;

interface ClaimStatusFiltersProps {
  selectedStatus: ClaimStatus;
  onStatusChange: (status: ClaimStatus) => void;
  counts?: Record<string, number>;
}

const CLAIM_STATUSES: { value: ClaimStatus; label: string }[] = [
  { value: "no_claim_filed", label: "No Claim" },
  { value: "claim_filed_awaiting_adjuster", label: "Claim Filed" },
  { value: "adjuster_visit_scheduled", label: "Adjuster Scheduled" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved (RCV)" },
  { value: "approved_acv_only", label: "Approved (ACV)" },
  { value: "supplements_needed", label: "Supplements Needed" },
  { value: "denied", label: "Denied" },
];

export function ClaimStatusFilters({
  selectedStatus,
  onStatusChange,
  counts = {},
}: ClaimStatusFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium" style={{ color: colors.inkSecondary }}>
        Claim Status:
      </span>
      <button
        onClick={() => onStatusChange(null)}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-all",
          "hover:scale-105 active:scale-95"
        )}
        style={{
          backgroundColor: selectedStatus === null ? colors.primary : colors.neutralLight,
          color: selectedStatus === null ? colors.white : colors.inkSecondary,
        }}
      >
        All
      </button>
      {CLAIM_STATUSES.map((status) => {
        const count = counts[status.value] || 0;
        const isActive = selectedStatus === status.value;
        
        return (
          <button
            key={status.value}
            onClick={() => onStatusChange(status.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              "hover:scale-105 active:scale-95 flex items-center gap-1.5"
            )}
            style={{
              backgroundColor: isActive ? colors.primary : colors.neutralLight,
              color: isActive ? colors.white : colors.inkSecondary,
            }}
          >
            {status.label}
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
















































