// Block 19600 — SmartSend Owner Inbox v1
// Filters component for Hot/Warm/Cold/Not Interested

"use client";

type IntentFilter = "hot_lead" | "warm_lead" | "cold_lead" | "dead_lead" | "follow_up_needed" | null;

interface InboxFiltersProps {
  intentFilter: IntentFilter;
  onIntentFilterChange: (filter: IntentFilter) => void;
  campaignId: string | null;
  onCampaignIdChange: (campaignId: string | null) => void;
}

export default function InboxFilters({
  intentFilter,
  onIntentFilterChange,
  campaignId,
  onCampaignIdChange,
}: InboxFiltersProps) {
  const filters = [
    { value: null as IntentFilter, label: "All", color: "neutral" },
    { value: "hot_lead" as IntentFilter, label: "Hot", color: "red" },
    { value: "warm_lead" as IntentFilter, label: "Warm", color: "orange" },
    { value: "cold_lead" as IntentFilter, label: "Cold", color: "blue" },
    { value: "dead_lead" as IntentFilter, label: "Not Interested", color: "gray" },
    { value: "follow_up_needed" as IntentFilter, label: "Follow-Up", color: "yellow" },
  ];

  const getColorClasses = (color: string, isActive: boolean) => {
    const base = "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors";
    if (!isActive) {
      return `${base} bg-neutral-100 text-neutral-600 hover:bg-neutral-200`;
    }
    switch (color) {
      case "red":
        return `${base} bg-red-100 text-red-700 border-2 border-red-300`;
      case "orange":
        return `${base} bg-orange-100 text-orange-700 border-2 border-orange-300`;
      case "blue":
        return `${base} bg-blue-100 text-blue-700 border-2 border-blue-300`;
      case "gray":
        return `${base} bg-gray-100 text-gray-700 border-2 border-gray-300`;
      case "yellow":
        return `${base} bg-yellow-100 text-yellow-700 border-2 border-yellow-300`;
      default:
        return `${base} bg-neutral-200 text-neutral-900 border-2 border-neutral-400`;
    }
  };

  return (
    <div className="p-4 border-b border-neutral-200 space-y-3">
      <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
        Quick Filters
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.value || "all"}
            onClick={() => onIntentFilterChange(filter.value)}
            className={getColorClasses(filter.color, intentFilter === filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}



















































