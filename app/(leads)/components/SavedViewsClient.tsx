"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EnrichHealthCard } from "./EnrichHealthCard";
import { EnrichmentStatus } from "./EnrichmentStatus";
import { SavedViewChip, type SavedView } from "./SavedViewChip";
import { FilterBuilderModal } from "./FilterBuilderModal";
import { useSavedViewRows } from "../hooks/useSavedViewRows";
import { DupeDrawer } from "../dupes/DupeDrawer";
import { MetricsCard } from "../dupes/MetricsCard";
import { ErrorsCard } from "../dupes/ErrorsCard";
import { CreateSmartListModal } from "@/components/smartlists/CreateSmartListModal";

type Props = {
  initialViews: SavedView[];
  initialViewId?: string;
  campaigns: { id: string; name: string }[];
};

export function SavedViewsClient({ initialViews, initialViewId, campaigns }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [smartListOpen, setSmartListOpen] = React.useState(false);
  const [views, setViews] = React.useState<SavedView[]>(initialViews);
  const [selectedView, setSelectedView] = React.useState<string | undefined>(
    initialViewId
  );
  const [dupesOpen, setDupesOpen] = React.useState(false);

  React.useEffect(() => {
    setViews(initialViews);
  }, [initialViews]);

  React.useEffect(() => {
    setSelectedView(initialViewId);
  }, [initialViewId]);

  const { rows, errorMessage, isLoading, mutate } = useSavedViewRows(
    selectedView,
    100,
    0
  );

  function updateQuery(nextViewId: string | undefined) {
    const params = new URLSearchParams(searchParams?.toString());
    if (nextViewId) {
      params.set("view", nextViewId);
    } else {
      params.delete("view");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function handleViewChange(next: string) {
    const nextId = next || undefined;
    setSelectedView(nextId);
    updateQuery(nextId);
  }

  function handleSaved(viewId: string) {
    setBuilderOpen(false);
    setSelectedView(viewId);
    updateQuery(viewId);
    router.refresh();
  }

  const techStackLabel = (stack: unknown): string => {
    if (Array.isArray(stack)) {
      return stack.join(", ");
    }
    if (stack && typeof stack === "object") {
      try {
        const arr = Array.isArray((stack as any).tech_tags)
          ? (stack as any).tech_tags
          : (stack as any).tech_stack;
        if (Array.isArray(arr)) {
          return arr.join(", ");
        }
      } catch (err) {
        console.error(err);
      }
    }
    if (typeof stack === "string") {
      return stack;
    }
    return "";
  };

  return (
    <div className="space-y-6">
      <EnrichHealthCard showRetry />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SavedViewChip views={views} value={selectedView} onChange={handleViewChange} />
          {selectedView ? (
            <Button
              variant="ghost"
              onClick={() => {
                mutate();
                router.refresh();
              }}
              size="sm"
            >
              Refresh
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDupesOpen(true)}>
            Duplicates
          </Button>
          <Button variant="outline" onClick={() => setSmartListOpen(true)}>
            🤖 New SmartList
          </Button>
          <Button onClick={() => setBuilderOpen(true)}>New View</Button>
          <EnrichmentStatus />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <MetricsCard />
        <ErrorsCard />
      </div>

      <FilterBuilderModal
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onSaved={handleSaved}
        campaigns={campaigns}
      />
      <CreateSmartListModal
        open={smartListOpen}
        onOpenChange={setSmartListOpen}
        onCreated={() => {
          router.refresh();
        }}
      />
      <DupeDrawer open={dupesOpen} onOpenChange={setDupesOpen} />

      {!selectedView ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Pick a saved view to preview matching leads.
        </div>
      ) : null}

      {selectedView ? (
        <>
          {(() => {
            const currentView = views.find((v) => v.id === selectedView);
            return currentView?.smart ? (
              <div className="rounded-md border bg-muted/50 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-lg">🤖</span>
                  <div className="flex-1 space-y-1">
                    <div className="font-medium">SmartList (AI-Optimized)</div>
                    {currentView.llm_prompt && (
                      <div className="text-xs text-muted-foreground">
                        Intent: {currentView.llm_prompt}
                      </div>
                    )}
                    {currentView.last_refreshed && (
                      <div className="text-xs text-muted-foreground">
                        Last updated: {new Date(currentView.last_refreshed).toLocaleString()}
                      </div>
                    )}
                    {!currentView.last_refreshed && (
                      <div className="text-xs text-muted-foreground">
                        Initial rules will be generated on first refresh
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {errorMessage ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-10 w-full animate-pulse rounded-md bg-muted"
                />
              ))}
            </div>
          ) : null}

          {!isLoading && rows.length === 0 && !errorMessage ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No leads matched this view.
            </div>
          ) : null}

          {!isLoading && rows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Industry</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Employees</th>
                    <th className="px-3 py-2">Tech Stack</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.lead_id} className="border-t">
                      <td className="px-3 py-2">
                        {[row.first_name, row.last_name]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>
                      <td className="px-3 py-2">{row.email ?? "—"}</td>
                      <td className="px-3 py-2">
                        {row.company_name ?? row.company_domain ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.company_industry ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.company_category ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.company_employee_count ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {techStackLabel(row.tech_stack) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}


