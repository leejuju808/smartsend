"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EnrichmentBadge, getEnrichmentState, type EnrichmentState } from "./EnrichmentBadge";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export type EnrichmentJobSummary = {
  status: string | null;
  reason: string | null;
  picked_at: string | null;
  created_at: string;
  force: boolean | null;
};

export type EnrichmentSnapshot = {
  lead_id: string;
  updated_at: string | null;
  title: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_website: string | null;
  company_size: string | null;
  industry: string | null;
  tech_tags: string[] | null;
  vendor: string | null;
  vendor_confidence: number | null;
  last_refreshed_at: string | null;
  refresh_after: string | null;
  is_stale: boolean | null;
};

export type EnrichmentDetails = {
  enrichment: EnrichmentSnapshot | null;
  job: EnrichmentJobSummary | null;
  loading?: boolean;
};

interface EnrichmentPanelProps {
  open: boolean;
  lead: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
  details?: EnrichmentDetails;
  onClose: () => void;
  onRequestRefresh?: () => Promise<void> | void;
}

export function EnrichmentPanel({
  open,
  lead,
  details,
  onClose,
  onRequestRefresh,
}: EnrichmentPanelProps) {
  const { toast } = useToast();
  const [refreshing, setRefreshing] = React.useState(false);

  const enrichment = details?.enrichment ?? null;
  const job = details?.job ?? null;
  const loading = details?.loading ?? false;
  const state: EnrichmentState = getEnrichmentState({ enrichment, job });

  const lastRefreshedText = React.useMemo(() => {
    const ts = enrichment?.last_refreshed_at;
    if (!ts) return "Never";
    try {
      return `${new Date(ts).toLocaleString()} (${formatDistanceToNow(new Date(ts), { addSuffix: true })})`;
    } catch {
      return new Date(ts).toLocaleString();
    }
  }, [enrichment?.last_refreshed_at]);

  const refreshAfterText = React.useMemo(() => {
    const ts = enrichment?.refresh_after;
    if (!ts) return "Not scheduled";
    try {
      return `${new Date(ts).toLocaleString()} (${formatDistanceToNow(new Date(ts), { addSuffix: true })})`;
    } catch {
      return new Date(ts).toLocaleString();
    }
  }, [enrichment?.refresh_after]);

  async function handleRefresh() {
    if (!lead) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to queue enrichment");
      }
      toast({ description: "Enrichment queued" });
      await onRequestRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to queue enrichment";
      toast({ description: message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }

  const fullName =
    [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || lead?.email || "Lead";

  const companyDisplay = enrichment?.company_name ?? lead?.company ?? "—";

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent side="right" className="flex h-full w-full flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Lead Enrichment</SheetTitle>
          {lead?.email && <p className="text-sm text-muted-foreground">{lead.email}</p>}
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{fullName}</h2>
              <p className="text-sm text-muted-foreground">{companyDisplay}</p>
            </div>
            <EnrichmentBadge
              state={state}
              loading={loading}
              title={
                enrichment?.last_refreshed_at
                  ? `Last refreshed ${new Date(enrichment.last_refreshed_at).toLocaleString()}`
                  : undefined
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleRefresh} disabled={refreshing || !lead}>
              {refreshing ? "Queuing…" : "Refresh now"}
            </Button>
            {job?.status && (
              <span className="text-xs text-muted-foreground">
                Latest job: {job.status}
                {job.picked_at ? ` • picked ${formatDistanceToNow(new Date(job.picked_at), { addSuffix: true })}` : ""}
              </span>
            )}
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Profile</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoItem label="Title" value={enrichment?.title} loading={loading} />
              <InfoItem label="Seniority" value={enrichment?.seniority} loading={loading} />
              <InfoItem
                label="LinkedIn"
                value={
                  enrichment?.linkedin_url ? (
                    <a
                      href={enrichment.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline"
                    >
                      View profile
                    </a>
                  ) : (
                    null
                  )
                }
                loading={loading}
              />
              <InfoItem label="Vendor" value={enrichment?.vendor} loading={loading} />
              <InfoItem
                label="Confidence"
                value={
                  enrichment?.vendor_confidence != null
                    ? `${Math.round(enrichment.vendor_confidence * 100)}%`
                    : null
                }
                loading={loading}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Company</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoItem label="Company name" value={enrichment?.company_name} loading={loading} />
              <InfoItem label="Domain" value={enrichment?.company_domain} loading={loading} />
              <InfoItem
                label="Website"
                value={
                  enrichment?.company_website ? (
                    <a
                      href={enrichment.company_website.startsWith("http") ? enrichment.company_website : `https://${enrichment.company_website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline break-all"
                    >
                      {enrichment.company_website}
                    </a>
                  ) : (
                    null
                  )
                }
                loading={loading}
              />
              <InfoItem label="Company size" value={enrichment?.company_size} loading={loading} />
              <InfoItem
                label="Industry"
                value={enrichment?.industry}
                loading={loading}
                className="sm:col-span-2"
              />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Tech stack</h3>
            {loading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="h-5 w-20 animate-pulse rounded-full bg-muted" />
                ))}
              </div>
            ) : enrichment?.tech_tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {enrichment.tech_tags.slice(0, 15).map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No technology signals captured yet.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Freshness</h3>
            <div className="grid gap-2 text-sm">
              <InfoRow label="Last refreshed" value={lastRefreshedText} />
              <InfoRow label="Refresh after" value={refreshAfterText} />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoItem({
  label,
  value,
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      {loading ? (
        <span className="inline-flex h-5 w-28 animate-pulse rounded bg-muted" />
      ) : value ? (
        <div className="text-sm">{value}</div>
      ) : (
        <div className="text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}



