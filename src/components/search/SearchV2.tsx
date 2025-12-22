"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchInput } from "./SearchInput";
import { AdvancedFiltersDrawer, SearchFilters } from "./AdvancedFiltersDrawer";
import { SearchResultsList, SearchResult } from "./SearchResultsList";
import { SavedSearchCard, SavedSearch } from "./SavedSearchCard";
import { Button } from "@/components/ui/button";
import { Save, Bookmark } from "lucide-react";
import { createClientComponentClient } from "@supabase/supabase-js";

interface SearchV2Props {
  onContactClick?: (contactId: string) => void;
  initialQuery?: string;
  initialFilters?: SearchFilters;
}

export function SearchV2({
  onContactClick,
  initialQuery = "",
  initialFilters = {},
}: SearchV2Props) {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const supabase = createClientComponentClient();

  // Load saved searches on mount
  useEffect(() => {
    loadSavedSearches();
  }, []);

  // Perform search when query or filters change
  useEffect(() => {
    performSearch();
  }, [query, filters, offset]);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const filtersParam = JSON.stringify(filters);
      const response = await fetch(
        `/api/search/v2?query=${encodeURIComponent(query)}&filters=${encodeURIComponent(filtersParam)}&limit=${limit}&offset=${offset}`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      if (data.ok) {
        setResults(data.results || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, filters, offset, limit]);

  const loadSavedSearches = async () => {
    try {
      const response = await fetch("/api/search/saved");
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setSavedSearches(data.saved_searches || []);
        }
      }
    } catch (error) {
      console.error("Error loading saved searches:", error);
    }
  };

  const handleSaveSearch = async () => {
    const name = prompt("Enter a name for this search:");
    if (!name || !name.trim()) return;

    try {
      const response = await fetch("/api/search/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          query,
          filters,
        }),
      });

      if (response.ok) {
        await loadSavedSearches();
        alert("Search saved!");
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || "Failed to save search"}`);
      }
    } catch (error) {
      console.error("Error saving search:", error);
      alert("Failed to save search");
    }
  };

  const handleLoadSavedSearch = (savedSearch: SavedSearch) => {
    setQuery(savedSearch.query || "");
    setFilters(savedSearch.filters || {});
    setOffset(0);
    setShowSavedSearches(false);

    // Track usage
    fetch(`/api/search/saved/${savedSearch.id}`, {
      method: "POST",
    }).catch(console.error);
  };

  const handleDeleteSavedSearch = async (id: string) => {
    try {
      const response = await fetch(`/api/search/saved?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadSavedSearches();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || "Failed to delete search"}`);
      }
    } catch (error) {
      console.error("Error deleting search:", error);
      alert("Failed to delete search");
    }
  };

  const handleTrackUsage = async (id: string) => {
    try {
      await fetch(`/api/search/saved/${id}`, {
        method: "POST",
      });
    } catch (error) {
      console.error("Error tracking usage:", error);
    }
  };

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setOffset(0);
  };

  const handleNextPage = () => {
    if (results.length < total) {
      setOffset((prev) => prev + limit);
    }
  };

  const handlePrevPage = () => {
    setOffset((prev) => Math.max(0, prev - limit));
  };

  const hasActiveFilters = Object.values(filters).some(
    (v) => v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  );

  return (
    <div className="space-y-4">
      {/* Search Bar and Controls */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            onSearch={(q) => {
              setQuery(q);
              setOffset(0);
            }}
            placeholder="Search homeowners, emails, cities, tags, notes..."
          />
        </div>
        <AdvancedFiltersDrawer
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />
        <Button
          variant="outline"
          onClick={() => setShowSavedSearches(!showSavedSearches)}
          className="gap-2"
        >
          <Bookmark className="h-4 w-4" />
          Saved
        </Button>
        {(query || hasActiveFilters) && (
          <Button variant="outline" onClick={handleSaveSearch} className="gap-2">
            <Save className="h-4 w-4" />
            Save
          </Button>
        )}
      </div>

      {/* Saved Searches */}
      {showSavedSearches && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-semibold mb-3">Saved Searches</h3>
          {savedSearches.length === 0 ? (
            <p className="text-sm text-gray-500">No saved searches yet</p>
          ) : (
            <div className="grid gap-2">
              {savedSearches.map((savedSearch) => (
                <SavedSearchCard
                  key={savedSearch.id}
                  savedSearch={savedSearch}
                  onLoad={handleLoadSavedSearch}
                  onDelete={handleDeleteSavedSearch}
                  onTrackUsage={handleTrackUsage}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Active filters:</span>
          {filters.status && filters.status.length > 0 && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
              Status: {filters.status.join(", ")}
            </span>
          )}
          {(filters.lead_score_min !== undefined || filters.lead_score_max !== undefined) && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
              Score: {filters.lead_score_min || 0}-{filters.lead_score_max || 100}
            </span>
          )}
          {filters.tags && filters.tags.length > 0 && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
              Tags: {filters.tags.length}
            </span>
          )}
          {filters.cities && filters.cities.length > 0 && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
              Cities: {filters.cities.length}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({});
              setOffset(0);
            }}
            className="text-xs"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Results */}
      <SearchResultsList
        results={results}
        loading={loading}
        onContactClick={onContactClick}
        total={total}
      />

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={offset === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={offset + limit >= total}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}





















































