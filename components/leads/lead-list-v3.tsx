"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import { LeadTable, Lead } from "./lead-table";
import { QuickFiltersBar, QuickFilters } from "./quick-filters";
import { ColumnConfigPanel, ColumnConfig } from "./column-config";
import { SavedViewsDropdown, SavedView } from "./saved-views-dropdown";
import { Button } from "@/components/ui/button";
import { Settings2, Download, UserPlus, Tag, Trash2 } from "lucide-react";
const PAGE_SIZE = 50;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface LeadListV3Props {
  workspaceId?: string;
  userId?: string;
}

export function LeadListV3({ workspaceId: propWorkspaceId, userId }: LeadListV3Props) {
  const [filters, setFilters] = useState<QuickFilters>({});
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(propWorkspaceId || null);
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(userId || null);

  // Get workspace ID from cookie or API
  useEffect(() => {
    if (!workspaceId) {
      // Try to get from cookie first
      const cookieWs = document.cookie
        .split("; ")
        .find((row) => row.startsWith("ws="))
        ?.split("=")[1];
      if (cookieWs) {
        setWorkspaceId(cookieWs);
      } else {
        // Fallback: fetch from API
        fetch("/api/me/workspace")
          .then((r) => r.json())
          .then((data) => {
            if (data.workspaceId) {
              setWorkspaceId(data.workspaceId);
            }
          })
          .catch(console.error);
      }
    }
  }, [workspaceId]);

  // Fetch workspace members (owners) and current user
  useEffect(() => {
    if (workspaceId) {
      // Fetch workspace members
      fetch(`/api/workspaces/${workspaceId}/members-list`)
        .then((r) => r.json())
        .then((data) => {
          if (data.members) {
            const ownerList = data.members.map((m: any) => ({
              id: m.id,
              name: m.name,
            }));
            setOwners(ownerList);
          }
        })
        .catch(console.error);

      // Fetch current user
      fetch("/api/auth/user")
        .then((r) => r.json())
        .then((data) => {
          if (data.user?.id) {
            setCurrentUserId(data.user.id);
          }
        })
        .catch(() => {
          // Fallback: try to get from auth
          import("@/utils/supabase/client").then(({ createClient }) => {
            const supabase = createClient();
            supabase.auth.getUser().then(({ data: { user } }) => {
              if (user) setCurrentUserId(user.id);
            });
          });
        });
    }
  }, [workspaceId]);

  // Build API URL with filters
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (previousPageData && (!previousPageData.data || previousPageData.data.length === 0)) {
      return null; // Reached the end
    }

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(pageIndex * PAGE_SIZE),
    });

    if (filters.search) params.set("search", filters.search);
    if (filters.owner) params.set("owner", filters.owner);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.company) params.set("company", filters.company);
    if (filters.score) params.set("score", filters.score);
    if (filters.reachability) params.set("reachability", filters.reachability);
    if (filters.date) params.set("date", filters.date);

    return `/api/leads/list?${params.toString()}`;
  };

  const { data, error, size, setSize, mutate } = useSWRInfinite(getKey, fetcher);

  // Load saved views
  useEffect(() => {
    if (workspaceId) {
      fetch("/api/saved-views/leads")
        .then((r) => r.json())
        .then((data) => {
          if (data.views) {
            setSavedViews(data.views);
          }
        })
        .catch(console.error);
    }
  }, [workspaceId]);

  // Apply saved view
  useEffect(() => {
    if (currentViewId) {
      const view = savedViews.find((v) => v.id === currentViewId);
      if (view) {
        setFilters(view.filters);
        setColumns(view.columns);
        mutate(); // Refresh data
      }
    }
  }, [currentViewId, savedViews, mutate]);

  const leads: Lead[] = useMemo(() => {
    return data?.flatMap((page) => page.data || []) || [];
  }, [data]);

  const isLoading = !data && !error;
  const isLoadingMore = data && typeof data[size - 1] === "undefined";
  const isEmpty = data?.[0]?.data?.length === 0;
  const isReachingEnd = isEmpty || (data && data[data.length - 1]?.data?.length < PAGE_SIZE);

  const handleLoadMore = useCallback(() => {
    setSize(size + 1);
  }, [size, setSize]);

  const handleLeadUpdate = useCallback(
    async (leadId: string, updates: Partial<Lead>) => {
      try {
        const response = await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error("Failed to update lead");
        }

        mutate(); // Refresh data
      } catch (error) {
        console.error("Failed to update lead:", error);
      }
    },
    [mutate]
  );

  const handleSaveView = useCallback(
    async (name: string, viewFilters: QuickFilters, viewColumns: ColumnConfig[], sort?: { key: string; ascending: boolean }) => {
      try {
        const response = await fetch("/api/saved-views/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            filters: viewFilters,
            columns: viewColumns,
            sort,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save view");
        }

        const { view } = await response.json();
        setSavedViews((prev) => [...prev, view]);
      } catch (error) {
        console.error("Failed to save view:", error);
        throw error;
      }
    },
    []
  );

  const handleDeleteView = useCallback(async (viewId: string) => {
    try {
      const response = await fetch(`/api/saved-views/leads?id=${viewId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete view");
      }

      setSavedViews((prev) => prev.filter((v) => v.id !== viewId));
      if (currentViewId === viewId) {
        setCurrentViewId(null);
      }
    } catch (error) {
      console.error("Failed to delete view:", error);
      throw error;
    }
  }, [currentViewId]);

  // Infinite scroll detection
  useEffect(() => {
    const handleScroll = () => {
      if (isReachingEnd || isLoadingMore) return;

      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = document.documentElement.scrollTop;
      const clientHeight = document.documentElement.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 100) {
        handleLoadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isReachingEnd, isLoadingMore, handleLoadMore]);

  return (
    <div className="space-y-4">
      {/* Header with Saved Views and Column Config */}
      <div className="flex items-center justify-between">
        <SavedViewsDropdown
          views={savedViews}
          currentViewId={currentViewId || undefined}
          onSelectView={setCurrentViewId}
          onSaveView={handleSaveView}
          onDeleteView={handleDeleteView}
          currentFilters={filters}
          currentColumns={columns}
        />
        <Button
          variant="outline"
          onClick={() => setColumnConfigOpen(true)}
        >
          <Settings2 className="h-4 w-4 mr-2" />
          Configure Columns
        </Button>
      </div>

      {/* Quick Filters */}
      <QuickFiltersBar
        filters={filters}
        onFiltersChange={setFilters}
        owners={owners}
        currentUserId={currentUserId}
      />

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4 mr-1" />
            Assign Owner
          </Button>
          <Button variant="outline" size="sm">
            <Tag className="h-4 w-4 mr-1" />
            Add Tag
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button variant="outline" size="sm" className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* Lead Table */}
      {isLoading ? (
        <div className="p-8 text-center">Loading leads...</div>
      ) : error ? (
        <div className="p-8 text-center text-destructive">Error loading leads</div>
      ) : (
        <>
          <LeadTable
            leads={leads}
            columns={columns.length > 0 ? columns : []}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onLeadUpdate={handleLeadUpdate}
            stickyHeader
            stickyFirstColumn
          />
          {isLoadingMore && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading more...
            </div>
          )}
        </>
      )}

      {/* Column Config Panel */}
      <ColumnConfigPanel
        open={columnConfigOpen}
        onOpenChange={setColumnConfigOpen}
        columns={columns}
        onSave={setColumns}
      />
    </div>
  );
}

