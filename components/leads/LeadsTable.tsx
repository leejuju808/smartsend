"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { LeadsFilterState } from "@/components/leads/LeadsFilters";
import {
  EnrichmentBadge,
  getEnrichmentState,
} from "@/app/(leads)/components/enrichment/EnrichmentBadge";
import {
  EnrichmentPanel,
  type EnrichmentDetails,
  type EnrichmentJobSummary,
  type EnrichmentSnapshot,
} from "@/app/(leads)/components/enrichment/EnrichmentPanel";
import { LeadProfileDrawer } from "@/components/leads/LeadProfileDrawer";

type LeadRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  status: string;
  attempt_count?: number | null;
  created_at: string;
  campaign_id: string | null;
};

const PAGE_SIZES = [10, 25, 50, 100];

export function LeadsTable({ filters }: { filters: LeadsFilterState }) {
  const sb = React.useMemo(() => supabaseBrowser(), []);

  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [total, setTotal] = React.useState<number>(0);
  const [page, setPage] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<number>(25);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [enrichmentByLead, setEnrichmentByLead] = React.useState<Record<string, EnrichmentDetails>>({});
  const [selectedLead, setSelectedLead] = React.useState<LeadRow | null>(null);
  const [selectedLeadIdForProfile, setSelectedLeadIdForProfile] = React.useState<string | null>(null);
  const [profileDrawerOpen, setProfileDrawerOpen] = React.useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadEnrichmentDetails = React.useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;

      setEnrichmentByLead((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const existing = next[id];
          next[id] = {
            enrichment: existing?.enrichment ?? null,
            job: existing?.job ?? null,
            loading: true,
          };
        });
        return next;
      });

      const [enrichmentRes, jobRes] = await Promise.all([
        sb
          .from("v_lead_enrichment")
          .select(
            "lead_id,updated_at,title,seniority,linkedin_url,company_name,company_domain,company_website,company_size,industry,tech_tags,vendor,vendor_confidence,last_refreshed_at,refresh_after,is_stale"
          )
          .in("lead_id", ids),
        sb
          .from("lead_enrichment_jobs")
          .select("lead_id,status,reason,picked_at,created_at,force")
          .in("lead_id", ids)
          .in("status", ["queued", "running"])
          .order("created_at", { ascending: false }),
      ]);

      if (enrichmentRes.error) {
        console.error("Failed to load enrichment snapshots:", enrichmentRes.error.message);
      }
      if (jobRes.error) {
        console.error("Failed to load enrichment jobs:", jobRes.error.message);
      }

      const enrichmentMap = new Map<string, EnrichmentSnapshot>();
      for (const row of (enrichmentRes.data as EnrichmentSnapshot[] | null) ?? []) {
        enrichmentMap.set(row.lead_id, row);
      }

      const jobMap = new Map<string, EnrichmentJobSummary>();
      for (const job of (jobRes.data as EnrichmentJobSummary[] | null) ?? []) {
        if (!jobMap.has(job.lead_id)) {
          jobMap.set(job.lead_id, job);
        }
      }

      setEnrichmentByLead((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          next[id] = {
            enrichment: enrichmentMap.get(id) ?? null,
            job: jobMap.get(id) ?? null,
            loading: false,
          };
        });
        return next;
      });
    },
    [sb]
  );

  async function load() {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = sb.from("leads").select("id,email,first_name,last_name,company,status,created_at,campaign_id,attempt_count,score", { count: "exact" }).order("score", { ascending: false, nullsLast: true }).order("created_at", { ascending: false }).range(from, to);

    if (filters.campaignId && filters.campaignId !== "<current-campaign-id>") {
      q = q.eq("campaign_id", filters.campaignId);
    }
    if (filters.status && filters.status !== "all") {
      q = q.eq("status", filters.status);
    }
    if (filters.q && filters.q.trim().length > 0) {
      const like = `%${filters.q.trim()}%`;
      q = q.or(
        [
          `email.ilike.${like}`,
          `company.ilike.${like}`,
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
        ].join(",")
      );
    }
    if (filters.from) q = q.gte("created_at", new Date(filters.from + "T00:00:00Z").toISOString());
    if (filters.to) q = q.lte("created_at", new Date(filters.to + "T23:59:59Z").toISOString());

    const { data, error, count } = await q;
    setLoading(false);
    if (error) {
      console.error("Failed to load leads:", error.message);
      setRows([]);
      setTotal(0);
      setEnrichmentByLead({});
      return;
    }
    setRows((data as unknown as LeadRow[]) ?? []);
    setTotal(count ?? 0);
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, refreshKey]);

  // When filters change externally, reset to first page and reload
  React.useEffect(() => {
    setPage(1);
    setRefreshKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.campaignId, filters.status, filters.q, filters.from, filters.to]);

  React.useEffect(() => {
    if (!rows.length) {
      setEnrichmentByLead({});
      return;
    }
    const ids = rows.map((r) => r.id);
    void loadEnrichmentDetails(ids);
  }, [rows, loadEnrichmentDetails]);

  const handleRowOpen = React.useCallback((row: LeadRow) => {
    setSelectedLead(row);
  }, []);

  const handleRowClick = React.useCallback((row: LeadRow, e: React.MouseEvent) => {
    // Open lead profile drawer on row click
    setSelectedLeadIdForProfile(row.id);
    setProfileDrawerOpen(true);
  }, []);

  const handlePanelClose = React.useCallback(() => {
    setSelectedLead(null);
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Company</th>
              <th className="text-left p-3">Enrichment</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Attempts</th>
              <th className="text-left p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="p-3" colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                  No leads match your filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const detail = enrichmentByLead[r.id];
                const badgeState = detail ? getEnrichmentState(detail) : "missing";
                const badgeLoading = !detail || detail.loading;
                const lastRefreshed = detail?.enrichment?.last_refreshed_at ?? null;
                const badgeTitle = lastRefreshed
                  ? `Refreshed ${new Date(lastRefreshed).toLocaleString()}`
                  : undefined;

                return (
                <tr
                  key={r.id}
                  className="border-t hover:bg-muted/40 cursor-pointer"
                  onClick={(e) => handleRowClick(r, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(r, e as any);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="p-3 font-medium">{r.email}</td>
                  <td className="p-3">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-3">{r.company || "—"}</td>
                  <td className="p-3">
                    <EnrichmentBadge
                      state={badgeState}
                      loading={badgeLoading}
                      title={badgeTitle}
                    />
                  </td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3">{r.attempt_count ?? 0}</td>
                  <td className="p-3">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span>Rows per page:</span>
          <select
            className="border rounded-md px-2 py-1"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPage(1)} disabled={page === 1}>
            First
          </Button>
          <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Prev
          </Button>
          <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next
          </Button>
          <Button variant="outline" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            Last
          </Button>
          <Button onClick={() => setRefreshKey((k) => k + 1)}>Refresh</Button>
        </div>
      </div>

      <EnrichmentPanel
        open={Boolean(selectedLead)}
        lead={
          selectedLead
            ? {
                id: selectedLead.id,
                email: selectedLead.email,
                first_name: selectedLead.first_name,
                last_name: selectedLead.last_name,
                company: selectedLead.company,
              }
            : null
        }
        details={selectedLead ? enrichmentByLead[selectedLead.id] : undefined}
        onClose={handlePanelClose}
        onRequestRefresh={
          selectedLead ? () => loadEnrichmentDetails([selectedLead.id]) : undefined
        }
      />

      <LeadProfileDrawer
        leadId={selectedLeadIdForProfile}
        open={profileDrawerOpen}
        onClose={() => setProfileDrawerOpen(false)}
      />
    </div>
  );
}


