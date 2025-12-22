"use client";

import { useState } from "react";
import { Bookmark, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "./AdvancedFiltersDrawer";

export interface SavedSearch {
  id: string;
  name: string;
  description?: string | null;
  query?: string | null;
  filters: SearchFilters;
  is_shared?: boolean;
  usage_count?: number;
  last_used_at?: string | null;
  created_at?: string;
}

interface SavedSearchCardProps {
  savedSearch: SavedSearch;
  onLoad: (savedSearch: SavedSearch) => void;
  onDelete: (id: string) => void;
  onTrackUsage?: (id: string) => void;
}

export function SavedSearchCard({
  savedSearch,
  onLoad,
  onDelete,
  onTrackUsage,
}: SavedSearchCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLoad = () => {
    onLoad(savedSearch);
    onTrackUsage?.(savedSearch.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete saved search "${savedSearch.name}"?`)) {
      setIsDeleting(true);
      try {
        await onDelete(savedSearch.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const filterCount = Object.values(savedSearch.filters || {}).filter(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  ).length;

  const hasQuery = savedSearch.query && savedSearch.query.trim().length > 0;

  return (
    <div
      className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={handleLoad}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Bookmark className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 truncate">{savedSearch.name}</h3>
            {savedSearch.is_shared && (
              <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                Shared
              </span>
            )}
          </div>

          {savedSearch.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
              {savedSearch.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-gray-500">
            {hasQuery && (
              <span className="truncate">
                Query: "{savedSearch.query}"
              </span>
            )}
            {filterCount > 0 && (
              <span>
                {filterCount} filter{filterCount !== 1 ? "s" : ""}
              </span>
            )}
            {savedSearch.usage_count !== undefined && savedSearch.usage_count > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                Used {savedSearch.usage_count} time{savedSearch.usage_count !== 1 ? "s" : ""}
              </span>
            )}
            {savedSearch.last_used_at && (
              <span>
                Last used {new Date(savedSearch.last_used_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}





















































