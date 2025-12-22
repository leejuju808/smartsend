import { useState, useEffect, useCallback } from "react";
import type { ContactTimelineEvent, ContactTimelineResponse } from "@/lib/types/contact";

export interface TimelineFilters {
  types?: string[];
  dateFilter?: string; // "week", "month", "year", "all"
}

export function useContactTimeline(
  contactId: string | null,
  filters: TimelineFilters = {}
) {
  const [events, setEvents] = useState<ContactTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadMore = useCallback(async (cursor: string | null = null) => {
    if (!contactId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      if (filters.types && filters.types.length > 0) {
        params.set("types", filters.types.join(","));
      }
      if (filters.dateFilter && filters.dateFilter !== "all") {
        params.set("dateFilter", filters.dateFilter);
      }

      const res = await fetch(`/api/contacts/${contactId}/activity?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Failed to load timeline");
        if (!cursor) setEvents([]);
      } else {
        // Transform API response to match ContactTimelineEvent format
        const transformedEvents = json.events.map((e: any) => ({
          id: e.id,
          type: e.type,
          occurred_at: e.createdAt || e.occurred_at,
          createdAt: e.createdAt || e.occurred_at,
          title: e.title,
          body: e.body,
          meta: e.meta || {},
          created_by: e.created_by || e.user?.id,
          user: e.user,
        }));
        
        if (cursor) {
          // Append to existing events
          setEvents((prev) => [...prev, ...transformedEvents]);
        } else {
          // Replace events
          setEvents(transformedEvents);
        }
        setNextCursor(json.nextCursor);
        setHasMore(json.nextCursor !== null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
      if (!cursor) setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [contactId, filters.types, filters.dateFilter]);

  useEffect(() => {
    void loadMore(null);
  }, [loadMore]);

  const loadNextPage = useCallback(() => {
    if (nextCursor && !loading) {
      void loadMore(nextCursor);
    }
  }, [nextCursor, loading, loadMore]);

  return {
    events,
    loading,
    error,
    hasMore,
    loadNextPage,
    reload: () => void loadMore(null),
  };
}

