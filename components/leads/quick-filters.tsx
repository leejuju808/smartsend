"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuickFilters = {
  search?: string;
  owner?: string;
  tag?: string;
  company?: string;
  score?: string;
  reachability?: string;
  date?: string;
};

interface QuickFiltersBarProps {
  filters: QuickFilters;
  onFiltersChange: (filters: QuickFilters) => void;
  owners?: Array<{ id: string; name: string }>;
  tags?: string[];
  currentUserId?: string | null;
  className?: string;
}

export function QuickFiltersBar({
  filters,
  onFiltersChange,
  owners = [],
  tags = [],
  currentUserId,
  className,
}: QuickFiltersBarProps) {
  const [localSearch, setLocalSearch] = useState(filters.search || "");

  const handleFilterChange = useCallback(
    (key: keyof QuickFilters, value: string | undefined) => {
      onFiltersChange({
        ...filters,
        [key]: value || undefined,
      });
    },
    [filters, onFiltersChange]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      // Debounce search updates
      const timeout = setTimeout(() => {
        handleFilterChange("search", value || undefined);
      }, 300);
      return () => clearTimeout(timeout);
    },
    [handleFilterChange]
  );

  const clearFilter = (key: keyof QuickFilters) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    onFiltersChange(newFilters);
    if (key === "search") {
      setLocalSearch("");
    }
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2 p-3 bg-muted/50 rounded-lg border", className)}>
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Owner Filter */}
      <Select
        value={filters.owner || ""}
        onValueChange={(value) => handleFilterChange("owner", value || undefined)}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Owners</SelectItem>
          {currentUserId && (
            <SelectItem value={currentUserId}>Me</SelectItem>
          )}
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {owners.map((owner) => (
            <SelectItem key={owner.id} value={owner.id}>
              {owner.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Tag Filter */}
      {tags.length > 0 && (
        <Select
          value={filters.tag || ""}
          onValueChange={(value) => handleFilterChange("tag", value || undefined)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Tags</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Company Filter */}
      <Input
        placeholder="Company"
        value={filters.company || ""}
        onChange={(e) => handleFilterChange("company", e.target.value || undefined)}
        className="w-[150px]"
      />

      {/* Score Filter */}
      <Select
        value={filters.score || ""}
        onValueChange={(value) => handleFilterChange("score", value || undefined)}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Scores</SelectItem>
          <SelectItem value="hot">Hot (80+)</SelectItem>
          <SelectItem value="warm">Warm (50-79)</SelectItem>
          <SelectItem value="cool">Cool (20-49)</SelectItem>
          <SelectItem value="cold">Cold (&lt;20)</SelectItem>
        </SelectContent>
      </Select>

      {/* Reachability Filter */}
      <Select
        value={filters.reachability || ""}
        onValueChange={(value) => handleFilterChange("reachability", value || undefined)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Reachability" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All</SelectItem>
          <SelectItem value="valid">Valid</SelectItem>
          <SelectItem value="risky">Risky</SelectItem>
          <SelectItem value="invalid">Invalid</SelectItem>
          <SelectItem value="unknown">Unknown</SelectItem>
        </SelectContent>
      </Select>

      {/* Date Filter */}
      <Input
        type="date"
        value={filters.date?.split(",")[0] || ""}
        onChange={(e) => {
          const date = e.target.value;
          handleFilterChange("date", date || undefined);
        }}
        className="w-[150px]"
      />

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onFiltersChange({});
            setLocalSearch("");
          }}
          className="h-8"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}


