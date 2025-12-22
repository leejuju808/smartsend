"use client";

import { InboxFilter } from "../page";
import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";

interface FilterChipsProps {
  value: InboxFilter;
  onChange: (filter: InboxFilter) => void;
}

const filters: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "dead", label: "Dead" },
];

export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {filters.map((filter) => {
        const isActive = value === filter.value;
        return (
          <button
            key={filter.value}
            onClick={() => onChange(filter.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150",
              "hover:scale-105 active:scale-95"
            )}
            style={{
              backgroundColor: isActive ? colors.primary : colors.neutralLight,
              color: isActive ? colors.white : colors.inkSecondary,
            }}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

