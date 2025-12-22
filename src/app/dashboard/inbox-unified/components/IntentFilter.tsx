"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Filter = 
  | "all" 
  | "hot_lead" 
  | "warm_lead" 
  | "price_question" 
  | "follow_up_required" 
  | "not_interested" 
  | "referral";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  hot_lead: "Hot",
  warm_lead: "Warm",
  price_question: "Price Question",
  follow_up_required: "Needs Pressure",
  not_interested: "Not Interested",
  referral: "Referrals",
};

const FILTER_COLORS: Record<Filter, string> = {
  all: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  hot_lead: "bg-red-100 text-red-800 hover:bg-red-200 border-red-300",
  warm_lead: "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-300",
  price_question: "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-300",
  follow_up_required: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300",
  not_interested: "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-300",
  referral: "bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-300",
};

export function IntentFilter({
  filter,
  onFilterChange,
  counts,
}: {
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  counts: Record<string, number>;
}) {
  const filters: Filter[] = [
    "all",
    "hot_lead",
    "warm_lead",
    "price_question",
    "follow_up_required",
    "not_interested",
    "referral",
  ];

  return (
    <div className="border-b px-4 py-3">
      <div className="flex gap-2 overflow-x-auto">
        {filters.map((f) => {
          const count = counts[f] || 0;
          const isActive = filter === f;

          return (
            <Button
              key={f}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange(f)}
              className={`${isActive ? FILTER_COLORS[f] : ""} whitespace-nowrap`}
            >
              {FILTER_LABELS[f]}
              {count > 0 && (
                <Badge
                  variant="secondary"
                  className={`ml-2 ${isActive ? "bg-white/20" : ""}`}
                >
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}


































