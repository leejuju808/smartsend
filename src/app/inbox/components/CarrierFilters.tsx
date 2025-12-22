"use client";

import { cn } from "@/lib/utils";
import { colors } from "../constants/colors";

export type Carrier = 
  | "State Farm"
  | "Allstate"
  | "Farmers"
  | "Liberty Mutual"
  | "USAA"
  | "Travelers"
  | "Progressive"
  | "Geico"
  | "Other Carriers"
  | null;

interface CarrierFiltersProps {
  selectedCarrier: Carrier;
  onCarrierChange: (carrier: Carrier) => void;
  counts?: Record<string, number>;
}

const CARRIERS: Carrier[] = [
  "State Farm",
  "Allstate",
  "Farmers",
  "Liberty Mutual",
  "USAA",
  "Travelers",
  "Progressive",
  "Geico",
  "Other Carriers",
];

export function CarrierFilters({
  selectedCarrier,
  onCarrierChange,
  counts = {},
}: CarrierFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium" style={{ color: colors.inkSecondary }}>
        Carrier:
      </span>
      <button
        onClick={() => onCarrierChange(null)}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition-all",
          "hover:scale-105 active:scale-95"
        )}
        style={{
          backgroundColor: selectedCarrier === null ? colors.primary : colors.neutralLight,
          color: selectedCarrier === null ? colors.white : colors.inkSecondary,
        }}
      >
        All
      </button>
      {CARRIERS.map((carrier) => {
        const count = counts[carrier] || 0;
        const isActive = selectedCarrier === carrier;
        
        return (
          <button
            key={carrier}
            onClick={() => onCarrierChange(carrier)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              "hover:scale-105 active:scale-95 flex items-center gap-1.5"
            )}
            style={{
              backgroundColor: isActive ? colors.primary : colors.neutralLight,
              color: isActive ? colors.white : colors.inkSecondary,
            }}
          >
            {carrier}
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
















































