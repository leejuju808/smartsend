"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export type LeadSummary = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
};

type CandidateLeadInfo = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
};

export type MergeDirection = "candidate_into_primary" | "primary_into_candidate";

export type DupeCandidate = {
  id: string;
  other_lead_id: string;
  reason: string;
  score: number;
  leads?: CandidateLeadInfo | CandidateLeadInfo[] | null;
};

type DuplicateReviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryLead: LeadSummary | null;
  candidates: DupeCandidate[];
  loading?: boolean;
  errorMessage?: string | null;
  onMerge: (candidate: DupeCandidate, direction: MergeDirection, createAlias: boolean) => Promise<void>;
  currentIndex?: number;
  totalCount?: number;
  onNavigate?: (direction: "prev" | "next") => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
};

function formatName(first: string | null | undefined, last: string | null | undefined) {
  return [first, last].filter(Boolean).join(" ") || "—";
}

function reasonLabel(reason: string) {
  switch ((reason ?? "").toLowerCase()) {
    case "email":
      return "Exact email match";
    case "domain_name_sim":
      return "Domain + name match";
    case "company_email":
      return "Company email match";
    case "manual":
      return "Manual review";
    default:
      return reason || "Candidate";
  }
}

function getCandidateLead(candidate: DupeCandidate): CandidateLeadInfo | null {
  const raw = candidate.leads;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw;
}

export function DuplicateReviewModal({
  open,
  onOpenChange,
  primaryLead,
  candidates,
  loading = false,
  errorMessage,
  onMerge,
  currentIndex,
  totalCount,
  onNavigate,
  canNavigatePrev = true,
  canNavigateNext = true,
}: DuplicateReviewModalProps) {
  const [createAlias, setCreateAlias] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCreateAlias(true);
      setLocalError(null);
    } else {
      setPendingKey(null);
    }
  }, [open]);

  const primaryName = formatName(primaryLead?.first_name ?? null, primaryLead?.last_name ?? null);

  async function handleMerge(candidate: DupeCandidate, direction: MergeDirection) {
    const key = `${candidate.id}:${direction}`;
    setPendingKey(key);
    setLocalError(null);
    try {
      await onMerge(candidate, direction, createAlias);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Merge failed";
      setLocalError(message);
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review possible duplicates</DialogTitle>
          <DialogDescription>
            Compare the current lead with potential duplicates and merge them into a single canonical
            record.
          </DialogDescription>
          {typeof currentIndex === "number" && typeof totalCount === "number" ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Lead {Math.min(currentIndex + 1, totalCount)} of {totalCount}
            </div>
          ) : null}
        </DialogHeader>

        <div className="border rounded-lg p-3 bg-muted/30 text-xs">
          <div className="font-medium text-sm">Primary lead</div>
          <div className="mt-1 grid grid-cols-1 gap-1 md:grid-cols-2">
            <div>
              <span className="text-muted-foreground uppercase text-[11px]">Name</span>
              <div>{primaryName}</div>
            </div>
            <div>
              <span className="text-muted-foreground uppercase text-[11px]">Company</span>
              <div>{primaryLead?.company || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground uppercase text-[11px]">Title</span>
              <div>{primaryLead?.title || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground uppercase text-[11px]">Email</span>
              <div>{primaryLead?.email || "—"}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
          {loading && (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading duplicates…</div>
          )}

          {!loading && candidates.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No duplicate candidates found.
            </div>
          )}

          {!loading &&
            candidates.map((candidate) => {
              const info = getCandidateLead(candidate);
              const candidateName = formatName(info?.first_name ?? null, info?.last_name ?? null);
              const pendingIntoPrimary = pendingKey === `${candidate.id}:candidate_into_primary`;
              const pendingIntoCandidate = pendingKey === `${candidate.id}:primary_into_candidate`;

              return (
                <div key={candidate.id} className="rounded-lg border p-4 space-y-3 bg-background">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{reasonLabel(candidate.reason)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Score: {(candidate.score ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleMerge(candidate, "candidate_into_primary")}
                        disabled={pendingIntoPrimary}
                      >
                        {pendingIntoPrimary ? "Merging…" : "Merge into this lead"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMerge(candidate, "primary_into_candidate")}
                        disabled={pendingIntoCandidate}
                      >
                        {pendingIntoCandidate ? "Merging…" : "Merge this lead into candidate"}
                      </Button>
                    </div>
                  </div>

                  <Table>
                    <THead>
                      <TR>
                        <TH>Field</TH>
                        <TH>Primary</TH>
                        <TH>Candidate</TH>
                      </TR>
                    </THead>
                    <TBody>
                      <TR>
                        <TD>Name</TD>
                        <TD>{primaryName}</TD>
                        <TD>{candidateName}</TD>
                      </TR>
                      <TR>
                        <TD>Company</TD>
                        <TD>{primaryLead?.company || "—"}</TD>
                        <TD>{info?.company || "—"}</TD>
                      </TR>
                      <TR>
                        <TD>Title</TD>
                        <TD>{primaryLead?.title || "—"}</TD>
                        <TD>{info?.title || "—"}</TD>
                      </TR>
                      <TR>
                        <TD>Email</TD>
                        <TD>{primaryLead?.email || "—"}</TD>
                        <TD>{info?.email || "—"}</TD>
                      </TR>
                    </TBody>
                  </Table>
                </div>
              );
            })}
        </div>

        {(errorMessage || localError) && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError || errorMessage}
          </div>
        )}

        <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Checkbox checked={createAlias} onCheckedChange={(v) => setCreateAlias(Boolean(v))} />
          <span>Create email alias after merge</span>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            {onNavigate ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!canNavigatePrev || pendingKey !== null}
                  onClick={() => onNavigate("prev")}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={!canNavigateNext || pendingKey !== null}
                  onClick={() => onNavigate("next")}
                >
                  Next
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


