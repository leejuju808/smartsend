"use client";

import useSWR from "swr";
import { useState, useCallback } from "react";

export type SavedView = {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  entity_type: "leads" | "campaigns" | "inboxes" | "sequences" | "events" | "domains";
  config: {
    filters?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
    sort?: Array<{
      field: string;
      direction: "asc" | "desc";
    }>;
    hiddenColumns?: string[];
  };
  shared: boolean;
  is_default: boolean;
  category?: string | null;
  created_at: string;
  updated_at: string;
};

type CreateViewInput = {
  name: string;
  entity_type: SavedView["entity_type"];
  config: SavedView["config"];
  shared?: boolean;
  is_default?: boolean;
  category?: string;
};

type UpdateViewInput = Partial<CreateViewInput>;

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to fetch");
  }
  return res.json();
};

// Fetch saved views for an entity type
export function useSavedViews(entityType: SavedView["entity_type"]) {
  const { data, error, isLoading, mutate } = useSWR<{ ok: boolean; views: SavedView[] }>(
    `/api/saved-views-v2/list?entity_type=${entityType}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    data: data?.views ?? [],
    isLoading,
    error,
    mutate,
  };
}

// Fetch a single saved view
export function useSavedView(viewId: string | null) {
  const { data, error, isLoading } = useSWR<{ ok: boolean; view: SavedView }>(
    viewId ? `/api/saved-views-v2/${viewId}` : null,
    fetcher
  );

  return {
    data: data?.view,
    isLoading,
    error,
  };
}

// Create a new saved view
export function useCreateSavedView() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async (input: CreateViewInput) => {
    setIsPending(true);
    try {
      const res = await fetch("/api/saved-views-v2/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create saved view");
      }
      return await res.json();
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutateAsync: mutate, isPending };
}

// Update a saved view
export function useUpdateSavedView() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async ({ viewId, input }: { viewId: string; input: UpdateViewInput }) => {
    setIsPending(true);
    try {
      const res = await fetch(`/api/saved-views-v2/${viewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update saved view");
      }
      return await res.json();
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutateAsync: mutate, isPending };
}

// Delete a saved view
export function useDeleteSavedView() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async ({ viewId, entityType }: { viewId: string; entityType: SavedView["entity_type"] }) => {
    setIsPending(true);
    try {
      const res = await fetch(`/api/saved-views-v2/${viewId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete saved view");
      }
      return await res.json();
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutateAsync: mutate, isPending };
}

// Duplicate a saved view
export function useDuplicateSavedView() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(async ({ viewId, name }: { viewId: string; name?: string }) => {
    setIsPending(true);
    try {
      const res = await fetch(`/api/saved-views-v2/${viewId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to duplicate saved view");
      }
      return await res.json();
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutateAsync: mutate, isPending };
}

