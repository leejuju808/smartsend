// Block 16600 — SmartSend Activity Log v2
// Activity Filters Component

"use client";

interface ActivityFiltersProps {
  filters: {
    category: string;
    type: string;
    severity: string;
  };
  onFiltersChange: (filters: {
    category: string;
    type: string;
    severity: string;
  }) => void;
}

export function ActivityFilters({
  filters,
  onFiltersChange,
}: ActivityFiltersProps) {
  const categories = [
    { value: "", label: "All Categories" },
    { value: "messaging", label: "Messaging" },
    { value: "pipeline", label: "Pipeline" },
    { value: "scheduler", label: "Scheduler" },
    { value: "task", label: "Tasks" },
    { value: "storm", label: "Storm & Weather" },
    { value: "insurance", label: "Insurance" },
    { value: "revenue", label: "Revenue" },
    { value: "contact_intelligence", label: "Contact Intelligence" },
    { value: "user_action", label: "User Actions" },
  ];

  const severities = [
    { value: "", label: "All Severities" },
    { value: "urgent", label: "Urgent" },
    { value: "important", label: "Important" },
    { value: "info", label: "Info" },
    { value: "success", label: "Success" },
  ];

  return (
    <div className="flex flex-wrap gap-4 p-4 bg-gray-50 rounded-lg border">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Category
        </label>
        <select
          value={filters.category}
          onChange={(e) =>
            onFiltersChange({ ...filters, category: e.target.value })
          }
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Severity
        </label>
        <select
          value={filters.severity}
          onChange={(e) =>
            onFiltersChange({ ...filters, severity: e.target.value })
          }
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {severities.map((sev) => (
            <option key={sev.value} value={sev.value}>
              {sev.label}
            </option>
          ))}
        </select>
      </div>

      {(filters.category || filters.severity) && (
        <div className="flex items-end">
          <button
            onClick={() => onFiltersChange({ category: "", type: "", severity: "" })}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}





















































