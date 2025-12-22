// Block 20040 — Inbox Filters + Priority Toggle
"use client";

type EngagementFilter = "all" | "hot" | "warm" | "cold";
type SortMode = "priority" | "newest" | "oldest";

interface InboxPriorityFiltersProps {
  engagementFilter: EngagementFilter;
  sortMode: SortMode;
  onChangeFilter: (value: EngagementFilter) => void;
  onChangeSort: (value: SortMode) => void;
}

export function InboxPriorityFilters({
  engagementFilter,
  sortMode,
  onChangeFilter,
  onChangeSort,
}: InboxPriorityFiltersProps) {
  const chipBase =
    "px-3 py-1 rounded-full text-sm border cursor-pointer transition";
  const active =
    "bg-black text-white border-black";
  const inactive =
    "bg-white text-gray-700 border-gray-200 hover:border-gray-400";

  return (
    <div className="flex items-center justify-between mb-3 gap-4">
      {/* Engagement chips */}
      <div className="flex gap-2">
        {(["all", "hot", "warm", "cold"] as EngagementFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => onChangeFilter(f)}
            className={`${chipBase} ${
              engagementFilter === f ? active : inactive
            }`}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Sort select */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Sort by</span>
        <select
          value={sortMode}
          onChange={(e) => onChangeSort(e.target.value as SortMode)}
          className="border rounded-lg px-2 py-1 text-sm bg-white"
        >
          <option value="priority">Priority (Hot First)</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
    </div>
  );
}

















































