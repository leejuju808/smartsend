"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchBar, type SearchBarHandle, type SearchRow } from "@/app/(inbox)/SearchBar";
import { cn } from "@/lib/utils";

type SavedFilter = {
  id: string;
  name: string;
  params: Record<string, unknown>;
};

type SearchResultsProps = {
  campaignId?: string | null;
};

export function SearchResults({ campaignId }: SearchResultsProps) {
  const searchRef = React.useRef<SearchBarHandle>(null);
  const [rows, setRows] = React.useState<SearchRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [savedFilters, setSavedFilters] = React.useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = React.useState<string | null>(null);
  const applyingRef = React.useRef(false);

  const loadSavedFilters = React.useCallback(async () => {
    if (!campaignId) {
      setSavedFilters([]);
      return;
    }
    try {
      const response = await fetch(`/api/search/saved?campaignId=${campaignId}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("failed");
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setSavedFilters(
          data.map((item: any) => ({
            id: String(item.id),
            name: String(item.name),
            params: item.params ?? {},
          })),
        );
      } else {
        setSavedFilters([]);
      }
    } catch (error) {
      console.error("Failed to load saved filters", error);
      setSavedFilters([]);
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadSavedFilters();
  }, [loadSavedFilters]);

  const handleParamsChange = React.useCallback(() => {
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    if (activeFilterId !== null) {
      setActiveFilterId(null);
    }
  }, [activeFilterId]);

  const applyFilter = React.useCallback(
    (filter: SavedFilter) => {
      if (!searchRef.current) return;
      applyingRef.current = true;
      searchRef.current.applyParams(filter.params ?? {});
      setActiveFilterId(filter.id);
      setTimeout(() => {
        searchRef.current?.run();
      }, 0);
    },
    [],
  );

  const handleRefresh = React.useCallback(() => {
    if (!campaignId) return;
    searchRef.current?.run();
  }, [campaignId]);

  return (
    <Card className="rounded-2xl border">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Search</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadSavedFilters} disabled={!campaignId}>
              Refresh views
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={!campaignId || loading}>
              Run search
            </Button>
          </div>
        </div>

        {!campaignId ? (
          <div className="text-sm text-muted-foreground">Select a campaign to search threads.</div>
        ) : (
          <>
            {savedFilters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => applyFilter(filter)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      activeFilterId === filter.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted hover:bg-muted/80",
                    )}
                  >
                    {filter.name}
                  </button>
                ))}
              </div>
            )}

            <SearchBar
              ref={searchRef}
              campaignId={campaignId}
              onResults={setRows}
              onLoadingChange={setLoading}
              onParamsChange={handleParamsChange}
            />

            <ul className="mt-3 space-y-2">
              {loading ? (
                <li className="text-sm text-muted-foreground">Searching…</li>
              ) : rows.length === 0 ? (
                <li className="text-sm text-muted-foreground">No results.</li>
              ) : (
                rows.map((row) => (
                  <li
                    key={row.thread_id}
                    className="rounded-xl border p-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm">
                        <div className="font-medium">{row.company || row.lead_email || "Unknown lead"}</div>
                        <div className="text-xs text-muted-foreground">
                          {[row.lead_email, row.domain, row.label || "—"].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.last_inbound_at ? new Date(row.last_inbound_at).toLocaleString() : ""}
                      </div>
                    </div>
                    {row.snippet && row.snippet.length > 0 && (
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.snippet}</div>
                    )}
                    <div className="mt-2 text-xs">
                      <a
                        href={`/inbox/thread/${row.thread_id}`}
                        className="text-primary hover:underline"
                      >
                        Open thread
                      </a>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}






