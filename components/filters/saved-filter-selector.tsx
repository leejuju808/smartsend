"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import useSWR from "swr";
import { FilterState } from "./filter-builder";

type SavedFilter = {
  id: string;
  name: string;
  context: string;
  filter: FilterState;
  shared: boolean;
  created_by: string;
  created_at: string;
};

type SavedFilterSelectorProps = {
  context: "inbox" | "leads" | "pipeline" | "campaigns";
  setFilter: (filter: FilterState) => void;
  onClear?: () => void;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SavedFilterSelector({
  context,
  setFilter,
  onClear,
}: SavedFilterSelectorProps) {
  const { data, error, mutate } = useSWR<{ filters: SavedFilter[] }>(
    `/api/saved-filters/${context}`,
    fetcher
  );

  const filters = data?.filters ?? [];
  const [selectedId, setSelectedId] = React.useState<string>("");

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const selectedFilter = filters.find((f) => f.id === id);
    if (selectedFilter) {
      setFilter(selectedFilter.filter);
    }
  };

  const handleClear = () => {
    setSelectedId("");
    setFilter({});
    onClear?.();
  };

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Failed to load filters
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId} onValueChange={handleSelect}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Saved Filters" />
        </SelectTrigger>
        <SelectContent>
          {filters.length === 0 ? (
            <SelectItem value="none" disabled>
              No saved filters
            </SelectItem>
          ) : (
            filters.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name} {f.shared && "🔗"}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {selectedId && (
        <Button variant="outline" size="sm" onClick={handleClear}>
          Clear
        </Button>
      )}
    </div>
  );
}










