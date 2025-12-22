"use client";

import { cn } from "@/lib/utils";

const intentOptions = [
  { value: "all", label: "All" },
  { value: "interested", label: "Interested" },
  { value: "meeting", label: "Meeting" },
  { value: "not_now", label: "Not Now" },
  { value: "unsubscribe", label: "Unsubscribe" },
  { value: "ooo", label: "OOO" },
  { value: "bounce", label: "Bounce" },
  { value: "question", label: "Question" },
] as const;

interface IntentFiltersProps {
  selectedIntent: string;
  onIntentChange: (intent: string) => void;
  className?: string;
}

export default function IntentFilters({ selectedIntent, onIntentChange, className }: IntentFiltersProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {intentOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onIntentChange(option.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
            selectedIntent === option.value
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

