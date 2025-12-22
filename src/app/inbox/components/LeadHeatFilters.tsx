"use client";

import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";

export type LeadHeat = "HOT" | "WARM" | "NURTURE" | "COLD" | "NOT_A_FIT" | null;

interface LeadHeatFiltersProps {
  selectedHeat: LeadHeat;
  onHeatChange: (heat: LeadHeat) => void;
  counts?: Record<string, number>;
}

const LEAD_HEAT_LEVELS: { value: LeadHeat; label: string; emoji: string }[] = [
  { value: "HOT", label: "HOT", emoji: "🔥" },
  { value: "WARM", label: "WARM", emoji: "⚡" },
  { value: "NURTURE", label: "NURTURE", emoji: "📩" },
  { value: "COLD", label: "COLD", emoji: "❄️" },
  { value: "NOT_A_FIT", label: "NOT A FIT", emoji: "❌" },
];

export function LeadHeatFilters({
  selectedHeat,
  onHeatChange,
  counts = {},
}: LeadHeatFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium" style={{ color: colors.inkSecondary }}>
        Lead Heat:
      </span>
      <button
        onClick={() => onHeatChange(null)}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-all",
          "hover:scale-105 active:scale-95"
        )}
        style={{
          backgroundColor: selectedHeat === null ? colors.primary : colors.neutralLight,
          color: selectedHeat === null ? colors.white : colors.inkSecondary,
        }}
      >
        All
      </button>
      {LEAD_HEAT_LEVELS.map((heat) => {
        const count = counts[heat.value] || 0;
        const isActive = selectedHeat === heat.value;
        
        return (
          <button
            key={heat.value}
            onClick={() => onHeatChange(heat.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              "hover:scale-105 active:scale-95 flex items-center gap-1.5"
            )}
            style={{
              backgroundColor: isActive ? colors.primary : colors.neutralLight,
              color: isActive ? colors.white : colors.inkSecondary,
            }}
          >
            <span>{heat.emoji}</span>
            <span>{heat.label}</span>
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
















































