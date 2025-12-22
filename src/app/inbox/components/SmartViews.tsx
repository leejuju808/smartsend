"use client";

import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";
import { Star } from "lucide-react";

export type SmartView =
  | "install_ready"
  | "approved_no_proposal"
  | "needs_supplements"
  | "waiting_on_adjuster"
  | "high_value"
  | null;

interface SmartViewsProps {
  selectedView: SmartView;
  onViewChange: (view: SmartView) => void;
}

const SMART_VIEWS: { value: SmartView; label: string; description: string }[] = [
  {
    value: "install_ready",
    label: "Install Ready",
    description: "Ready to schedule installation",
  },
  {
    value: "approved_no_proposal",
    label: "Approved No Proposal",
    description: "Claim approved but proposal not sent",
  },
  {
    value: "needs_supplements",
    label: "Needs Supplements",
    description: "Supplement opportunity detected",
  },
  {
    value: "waiting_on_adjuster",
    label: "Waiting on Adjuster",
    description: "Adjuster contacted but no reply",
  },
  {
    value: "high_value",
    label: "High Value Jobs",
    description: "Jobs over $20,000",
  },
];

export function SmartViews({
  selectedView,
  onViewChange,
}: SmartViewsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium flex items-center gap-1" style={{ color: colors.inkSecondary }}>
        <Star className="h-3 w-3" />
        Smart Views:
      </span>
      {SMART_VIEWS.map((view) => {
        const isActive = selectedView === view.value;
        
        return (
          <button
            key={view.value}
            onClick={() => onViewChange(isActive ? null : view.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              "hover:scale-105 active:scale-95 flex items-center gap-1.5"
            )}
            style={{
              backgroundColor: isActive ? colors.primary : colors.neutralLight,
              color: isActive ? colors.white : colors.inkSecondary,
            }}
            title={view.description}
          >
            <Star className={cn("h-3 w-3", isActive && "fill-current")} />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}
















































