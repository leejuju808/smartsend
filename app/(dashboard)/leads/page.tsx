"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import LeadsFilters from "@/components/leads/Filters";
import { DataTable } from "@/components/leads/DataTable";
import { LeadListV3 } from "@/components/leads/lead-list-v3";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DuplicateReviewModal,
  DupeCandidate,
  LeadSummary,
  MergeDirection,
} from "@/components/leads/DuplicateReviewModal";
import { MergeDialog } from "@/app/(leads)/merge/MergeDialog";
import { SegmentBuilder } from './_components/segment-builder';
import { LeadSavedViewsBar } from "@/components/leads/lead-saved-views-bar";
import { SavedViewSwitcher } from "@/components/views/SavedViewSwitcher";
import Link from "next/link";

const fetcher = (u: string) => fetch(u).then(r => r.json());

type DuplicateSummary = {
  master_id: string;
  duplicate_id: string;
  master_name?: string | null;
  dup_name?: string | null;
  reason: string;
  master_email?: string | null;
  duplicate_email?: string | null;
  master_company?: string | null;
  duplicate_company?: string | null;
  name_score?: number | null;
  company_score?: number | null;
};

export default function LeadsPage() {
  const [useV3, setUseV3] = useState(true); // Toggle to use Lead List v3
  const [q, setQ] = useState<{ status?: string|null; campaignId?: string|null; from?: string|null; to?: string|null; page?: number; pageSize?: number; }>({ page: 1, pageSize: 25 });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string>("");

  // Fetch account and user info
  useEffect(() => {
    async function fetchAccountInfo() {
      try {
        const { createBrowserClient } = await import("@supabase/ssr");
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return;
        
        setOwnerId(user.id);
        
        // Fetch account_id from account_members
        const { data: membership } = await supabase
          .from("account_members")
          .select("account_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (membership?.account_id) {
          setAccountId(membership.account_id);
        }

        // Fetch workspace_id from workspace_members
        const { data: wsMembership } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        
        if (wsMembership?.workspace_id) {
          setWorkspaceId(wsMembership.workspace_id);
        }
      } catch (err) {
        console.error("Failed to fetch account info:", err);
      }
    }
    fetchAccountInfo();
  }, []);

  const loadDefaultLeads = () => {
    const qs = new URLSearchParams();
    if (q.status) qs.set("status", q.status);
    if (q.campaignId) qs.set("campaign_id", q.campaignId);
    if (q.from) qs.set("from", q.from);
    if (q.to) qs.set("to", q.to);
    qs.set("page", String(q.page ?? 1));
    qs.set("pageSize", String(q.pageSize ?? 25));
    return `/api/leads?${qs.toString()}`;
  };

  const { data, isLoading, mutate } = useSWR(
    activeViewId ? null : loadDefaultLeads(),
    fetcher
  );

  // Apply saved view when activeViewId changes
  useEffect(() => {
    if (!activeViewId) return;
    
    const applySavedView = async () => {
      try {
        const res = await fetch("/api/saved-views/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewId: activeViewId,
            page: q.page ?? 1,
            pageSize: q.pageSize ?? 25,
          }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          // Update the data manually
          mutate({ rows: json.leads, total: json.total, page: json.page, pageSize: json.pageSize }, false);
        }
      } catch (err) {
        console.error("Error applying saved view:", err);
      }
    };

    applySavedView();
  }, [activeViewId, q.page, q.pageSize, mutate]);
  const {
    data: duplicatesData,
    isLoading: duplicatesLoading,
    mutate: mutateDuplicates,
  } = useSWR<DuplicateSummary[]>("/api/leads/duplicates", fetcher);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkLeads, setBulkLeads] = useState<LeadSummary[]>([]);
  const [bulkCandidates, setBulkCandidates] = useState<Record<string, DupeCandidate[]>>({});
  const [bulkIndex, setBulkIndex] = useState(0);

  const leadsById = useMemo(() => {
    const map = new Map<string, LeadSummary>();
    rows.forEach((row: any) => {
      map.set(row.id, {
        id: row.id,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        company: row.company ?? null,
        title: (row.title as string | null) ?? null,
        email: row.email ?? null,
      });
    });
    return map;
  }, [rows]);

  const hasSelection = selectedIds.length > 0;
  const currentBulkLead = bulkLeads[bulkIndex] ?? null;
  const currentBulkCandidates = currentBulkLead
    ? bulkCandidates[currentBulkLead.id] ?? []
    : [];
  const canNavigatePrev = bulkIndex > 0;
  const canNavigateNext = bulkLeads.length > 0 && bulkIndex < bulkLeads.length - 1;
  const duplicates = duplicatesData ?? [];

  // Current filter config for saved views
  const currentFilterConfig = {
    status: q.status ?? null,
    campaignId: q.campaignId ?? null,
    from: q.from ?? null,
    to: q.to ?? null,
  };

  const handleApplyView = (config: any) => {
    setQ({
      ...config,
      page: 1,
      pageSize: q.pageSize ?? 25,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header with Import button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your homeowner leads and track outreach progress.
          </p>
        </div>
        <Link href="/leads/import">
          <Button>Import Leads</Button>
        </Link>
      </div>

      <SegmentBuilder />

      {/* Saved View Switcher */}
      <div className="flex items-center gap-3">
        <SavedViewSwitcher
          onSelect={(viewId) => {
            setActiveViewId(viewId);
            if (!viewId) {
              // Reset to default view
              setQ({ page: 1, pageSize: q.pageSize ?? 25 });
            }
          }}
        />
        {activeViewId && (
          <button
            onClick={() => {
              setActiveViewId("");
              setQ({ page: 1, pageSize: q.pageSize ?? 25 });
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear view
          </button>
        )}
      </div>

      {accountId && ownerId && (
        <LeadSavedViewsBar
          accountId={accountId}
          ownerId={ownerId}
          currentConfig={currentFilterConfig}
          onApplyView={handleApplyView}
        />
      )}

      <LeadsFilters
        initial={{ status: q.status ?? undefined, campaignId: q.campaignId ?? undefined, from: q.from ?? undefined, to: q.to ?? undefined }}
        onApply={(next: any) => setQ(prev => ({ ...prev, ...next, page: next.page ?? 1 }))}
        campaigns={[]} // TODO: pass your real campaign list
      />

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Potential Duplicates</h2>
            <p className="text-sm text-muted-foreground">
              Review and merge leads flagged by duplicate detection.
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={duplicatesLoading}
            onClick={() => mutateDuplicates()}
          >
            {duplicatesLoading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {duplicatesLoading && (
          <div className="mt-4 text-sm text-muted-foreground">Loading duplicates…</div>
        )}

        {!duplicatesLoading && duplicates.length === 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            All clear! No potential duplicates at the moment.
          </div>
        )}

        {!duplicatesLoading && duplicates.length > 0 && (
          <div className="mt-4 space-y-3">
            {duplicates.map((dup) => (
              <div
                key={`${dup.master_id}:${dup.duplicate_id}`}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-sm font-medium">
                    {dup.master_name ?? dup.master_email ?? "Primary lead"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Duplicate: {dup.dup_name ?? dup.duplicate_email ?? "Unknown"} • Reason:{" "}
                    {dup.reason}
                  </div>
                </div>
                <MergeDialog
                  duplicate={dup}
                  onMerged={() => {
                    mutateDuplicates();
                    mutate();
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* loading state */}
      {isLoading && (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {/* empty state */}
      {!isLoading && rows.length === 0 && (
        <div className="mx-auto mt-12 max-w-md rounded-2xl border p-8 text-center">
          <p className="text-lg font-medium">No leads found</p>
          <p className="mt-1 text-sm opacity-70">Try adjusting filters or import a CSV.</p>
          <div className="mt-4">
            <Button onClick={() => mutate()}>Refresh</Button>
          </div>
        </div>
      )}

      {/* Lead List v3 or Legacy Table */}
      {useV3 ? (
        <LeadListV3 workspaceId={workspaceId || undefined} userId={ownerId || undefined} />
      ) : (
        <>
          {/* table */}
          {!isLoading && rows.length > 0 && (
            <>
              <DataTable data={rows} onRefresh={() => mutate()} />
              {/* pagination */}
              <div className="flex items-center justify-between px-2 py-3">
                <div className="text-sm opacity-70">Total: {total} • Page {page} / {totalPages}</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={page <= 1} onClick={() => setQ(prev => ({ ...prev, page: (prev.page ?? 1) - 1 }))}>Prev</Button>
                  <Button variant="outline" disabled={page >= totalPages} onClick={() => setQ(prev => ({ ...prev, page: (prev.page ?? 1) + 1 }))}>Next</Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}


