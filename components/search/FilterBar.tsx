"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { StatusFilter } from "./StatusFilter";
import { TagFilter } from "./TagFilter";
import { TimeFilter } from "./TimeFilter";
import { CampaignFilter } from "./CampaignFilter";
import { ListFilter } from "./ListFilter";

export type FilterState = {
  status?: string;
  tags?: string[];
  timeRange?: string;
  campaignId?: string;
  listId?: string;
};

interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showStatus?: boolean;
  showTags?: boolean;
  showTime?: boolean;
  showCampaign?: boolean;
  showList?: boolean;
}

export function FilterBar({
  filters,
  onFiltersChange,
  showStatus = true,
  showTags = true,
  showTime = true,
  showCampaign = true,
  showList = false,
}: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount =
    (filters.status ? 1 : 0) +
    (filters.tags?.length || 0) +
    (filters.timeRange ? 1 : 0) +
    (filters.campaignId ? 1 : 0) +
    (filters.listId ? 1 : 0);

  const clearAllFilters = () => {
    onFiltersChange({
      status: undefined,
      tags: undefined,
      timeRange: undefined,
      campaignId: undefined,
      listId: undefined,
    });
  };

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Filters
            </button>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-black text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Clear all
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {showStatus && (
              <StatusFilter
                value={filters.status}
                onChange={(status) => onFiltersChange({ ...filters, status })}
              />
            )}
            {showTags && (
              <TagFilter
                value={filters.tags || []}
                onChange={(tags) => onFiltersChange({ ...filters, tags })}
              />
            )}
            {showTime && (
              <TimeFilter
                value={filters.timeRange}
                onChange={(timeRange) =>
                  onFiltersChange({ ...filters, timeRange })
                }
              />
            )}
            {showCampaign && (
              <CampaignFilter
                value={filters.campaignId}
                onChange={(campaignId) =>
                  onFiltersChange({ ...filters, campaignId })
                }
              />
            )}
            {showList && (
              <ListFilter
                value={filters.listId}
                onChange={(listId) => onFiltersChange({ ...filters, listId })}
              />
            )}
          </div>
        )}

        {/* Active filters chips */}
        {activeFilterCount > 0 && !isExpanded && (
          <div className="flex flex-wrap gap-2 mt-2">
            {filters.status && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                Status: {filters.status}
                <button
                  onClick={() =>
                    onFiltersChange({ ...filters, status: undefined })
                  }
                  className="hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded"
              >
                Tag: {tag}
                <button
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      tags: filters.tags?.filter((t) => t !== tag),
                    })
                  }
                  className="hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {filters.timeRange && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                {filters.timeRange}
                <button
                  onClick={() =>
                    onFiltersChange({ ...filters, timeRange: undefined })
                  }
                  className="hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.campaignId && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                Campaign
                <button
                  onClick={() =>
                    onFiltersChange({ ...filters, campaignId: undefined })
                  }
                  className="hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {filters.listId && (
              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                List
                <button
                  onClick={() =>
                    onFiltersChange({ ...filters, listId: undefined })
                  }
                  className="hover:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}





















































