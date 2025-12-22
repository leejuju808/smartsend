"use client";

import * as React from "react";
import useSWR from "swr";
import { PermissionsDrawer } from "@/components/library/PermissionsDrawer";
import { LIBRARY_KINDS, type LibraryKind } from "@/lib/library/constants";

type LibraryResource = {
  id: string;
  kind: LibraryKind;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  current_version: number;
  updated_at: string;
  tags?: string[] | null;
};

type LibraryResponse = {
  resources: LibraryResource[];
};

const fetcher = async (url: string): Promise<LibraryResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("fetch_failed");
  }
  return res.json();
};

function useLibrary(kind: LibraryKind) {
  const { data, error, isLoading, mutate } = useSWR(`/api/library?kind=${kind}`, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  return {
    resources: data?.resources ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}

export default function LibraryPage() {
  const [kind, setKind] = React.useState<LibraryKind>("nudge_preset");
  const { resources, error, isLoading } = useLibrary(kind);
  const [permissionsResourceId, setPermissionsResourceId] = React.useState<string | null>(null);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="text-sm text-muted-foreground">Discover shared presets and resources across your workspace.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {LIBRARY_KINDS.map((variant) => (
          <button
            type="button"
            key={variant}
            onClick={() => setKind(variant)}
            className={`rounded border px-3 py-1 text-sm transition ${
              variant === kind ? "border-black bg-black text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {variant.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Unable to load library resources right now. Please try again shortly.
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
          Loading resources…
        </div>
      ) : resources.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 p-6 text-center text-sm text-muted-foreground">
          No shared resources found for this category yet.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => (
            <li key={resource.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                {resource.kind} • v{resource.current_version}
              </div>
              <div className="mt-1 text-lg font-medium">{resource.name}</div>
              {resource.description ? <p className="mt-1 text-sm text-gray-600">{resource.description}</p> : null}
              <div className="mt-3 text-xs text-gray-400">
                Updated {new Date(resource.updated_at).toLocaleString()}
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" className="rounded border px-3 py-1 text-sm">
                  Adopt
                </button>
                <button type="button" className="rounded border px-3 py-1 text-sm">
                  Fork
                </button>
                <button type="button" className="rounded border px-3 py-1 text-sm">
                  Publish
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-1 text-sm"
                  onClick={() => setPermissionsResourceId(resource.id)}
                >
                  Permissions
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {permissionsResourceId ? (
        <PermissionsDrawer
          resourceId={permissionsResourceId}
          open={Boolean(permissionsResourceId)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPermissionsResourceId(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

