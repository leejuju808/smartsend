"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import ThreadRow from "@/components/inbox/ThreadRow";
import { BulkToolbar } from "@/components/inbox/BulkToolbar";
import { ThreadFilter } from "@/components/inbox/ThreadFilter";
import { InboxFilterBar } from "@/app/(inbox)/InboxFilterBar";
import type { InboxLabelCounts } from "@/app/(inbox)/InboxFilterBar";
import { NeedsResponse } from "@/app/(inbox)/NeedsResponse";
import { SearchResults } from "@/app/(inbox)/SearchResults";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tab = "all" | "needs_reply" | "nudged" | "snoozed";
type StatusCounts = Record<Tab, number>;
type LabelFilter = "all" | "untyped" | "positive" | "neutral" | "question" | "negative" | "ooo";
type StatusFilter = "all" | "replied" | "ooo" | "unsub" | "paused";
type StateFilter = "all" | "open" | "needs_reply" | "replied" | "closed";

const TAB_OPTIONS: Tab[] = ["all", "needs_reply", "nudged", "snoozed"];
const LABEL_OPTIONS: LabelFilter[] = ["all", "untyped", "positive", "neutral", "question", "negative", "ooo"];
const STATUS_OPTIONS: StatusFilter[] = ["all", "replied", "ooo", "unsub", "paused"];
const STATE_OPTIONS: StateFilter[] = ["all", "open", "needs_reply", "replied", "closed"];
const fetcher = (url: string) => fetch(url).then((res) => res.json());

const EMPTY_LABEL_COUNTS: InboxLabelCounts = {
  untyped: 0,
  positive: 0,
  neutral: 0,
  question: 0,
  negative: 0,
  ooo: 0,
};

export default function ThreadList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const campaignId = searchParams.get("campaignId") ?? "";

  const labelParam = searchParams.get("label");
  const initialLabel = LABEL_OPTIONS.includes(labelParam as LabelFilter) ? (labelParam as LabelFilter) : "all";
  const [labelFilter, setLabelFilter] = React.useState<LabelFilter>(initialLabel);

  const tabParam = searchParams.get("filter");
  const initialTab = TAB_OPTIONS.includes(tabParam as Tab) ? (tabParam as Tab) : "all";
  const [tab, setTab] = React.useState<Tab>(initialTab);

  const statusParam = searchParams.get("status");
  const initialStatus = STATUS_OPTIONS.includes(statusParam as StatusFilter)
    ? (statusParam as StatusFilter)
    : "all";
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatus);
  
  const stateParam = searchParams.get("state");
  const initialState = STATE_OPTIONS.includes(stateParam as StateFilter)
    ? (stateParam as StateFilter)
    : "all";
  const [stateFilter, setStateFilter] = React.useState<StateFilter>(initialState);
  
  const assignedParam = searchParams.get("assigned");
  const initialAssigned =
    assignedParam && assignedParam !== "" ? assignedParam : "all";
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>(initialAssigned);
  const { data: people } = useSWR<{ items: Array<{ id: string; name: string }> }>(
    campaignId ? `/api/campaigns/${campaignId}/people` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
  const assigneeOptions = people?.items ?? [];


  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selection, setSelection] = React.useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = React.useState(false);

  React.useEffect(() => {
    const param = searchParams.get("label");
    setLabelFilter(LABEL_OPTIONS.includes(param as LabelFilter) ? (param as LabelFilter) : "all");
  }, [searchParams]);

  React.useEffect(() => {
    const param = searchParams.get("filter");
    setTab(TAB_OPTIONS.includes(param as Tab) ? (param as Tab) : "all");
  }, [searchParams]);

  React.useEffect(() => {
    const param = searchParams.get("status");
    setStatusFilter(STATUS_OPTIONS.includes(param as StatusFilter) ? (param as StatusFilter) : "all");
  }, [searchParams]);

  React.useEffect(() => {
    const param = searchParams.get("state");
    setStateFilter(STATE_OPTIONS.includes(param as StateFilter) ? (param as StateFilter) : "all");
  }, [searchParams]);

  React.useEffect(() => {
    const param = searchParams.get("assigned");
    setAssigneeFilter(param && param !== "" ? param : "all");
  }, [searchParams]);

  const loadThreads = React.useCallback(async () => {
    if (!campaignId) {
      setRows([]);
      setSelection({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("campaignId", campaignId);
      qs.set("campaign_id", campaignId);
      if (assigneeFilter && assigneeFilter !== "all") {
        qs.set("assigned", assigneeFilter);
      }

      const response = await fetch(`/api/inbox/threads?${qs.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (response.ok && payload?.ok && Array.isArray(payload.rows)) {
        setRows(payload.rows);
        setSelection({});
      } else {
        setRows([]);
      }
    } catch (error) {
      console.error("Failed to load inbox threads", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [assigneeFilter, campaignId]);

  React.useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  React.useEffect(() => {
    const handleRefresh = () => loadThreads();
    window.addEventListener("inbox:counts:refresh", handleRefresh);
    window.addEventListener("thread:list:refresh", handleRefresh);
    return () => {
      window.removeEventListener("inbox:counts:refresh", handleRefresh);
      window.removeEventListener("thread:list:refresh", handleRefresh);
    };
  }, [loadThreads]);

  const statusCounts = React.useMemo<StatusCounts>(() => computeStatusCounts(rows), [rows]);
  const labelCounts = React.useMemo<InboxLabelCounts>(() => computeLabelCounts(rows), [rows]);

  const filteredRows = React.useMemo(
    () =>
      rows.filter(
        (row) => matchesTab(row, tab) && matchesLabel(row, labelFilter) && matchesStatus(row, statusFilter) && matchesState(row, stateFilter),
      ),
    [rows, tab, labelFilter, statusFilter, stateFilter],
  );

  const selectedIds = React.useMemo(() => {
    return filteredRows
      .map((row) => resolveRowId(row))
      .filter((id): id is string => Boolean(id) && selection[id]);
  }, [filteredRows, selection]);

  const allSelected = filteredRows.length > 0 && selectedIds.length === filteredRows.length;

  const handleTabChange = React.useCallback(
    (next: Tab) => {
      setTab(next);
      const usp = new URLSearchParams(searchParams.toString());
      if (next === "all") {
        usp.delete("filter");
      } else {
        usp.set("filter", next);
      }
      router.replace(`?${usp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleLabelChange = React.useCallback(
    (next: string) => {
      const cast = LABEL_OPTIONS.includes(next as LabelFilter) ? (next as LabelFilter) : "all";
      setLabelFilter(cast);
      const usp = new URLSearchParams(searchParams.toString());
      if (cast === "all") {
        usp.delete("label");
      } else {
        usp.set("label", cast);
      }
      router.replace(`?${usp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleStatusChange = React.useCallback(
    (next: string) => {
      const cast = STATUS_OPTIONS.includes(next as StatusFilter) ? (next as StatusFilter) : "all";
      setStatusFilter(cast);
      const usp = new URLSearchParams(searchParams.toString());
      if (cast === "all") {
        usp.delete("status");
      } else {
        usp.set("status", cast);
      }
      router.replace(`?${usp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleStateChange = React.useCallback(
    (next: string) => {
      const cast = STATE_OPTIONS.includes(next as StateFilter) ? (next as StateFilter) : "all";
      setStateFilter(cast);
      const usp = new URLSearchParams(searchParams.toString());
      if (cast === "all") {
        usp.delete("state");
      } else {
        usp.set("state", cast);
      }
      router.replace(`?${usp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleAssigneeChange = React.useCallback(
    (next: string) => {
      const cast = next || "all";
      setAssigneeFilter(cast);
      const usp = new URLSearchParams(searchParams.toString());
      if (cast === "all") {
        usp.delete("assigned");
      } else {
        usp.set("assigned", cast);
      }
      router.replace(`?${usp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const bulkCancel = React.useCallback(async () => {
    if (selectedIds.length === 0) {
      return;
    }

    setBulkLoading(true);
    try {
      const res = await fetch(`/api/inbox/nudges/cancel-batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadIds: selectedIds }),
      });
      const payload = await res.json();

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "cancel_failed");
      }

      setRows((prev) =>
        prev.map((row: any) => {
          const id = resolveRowId(row);
          if (!id || !selection[id]) {
            return row;
          }
          const currentFlags = row.flags ?? {};
          if (!currentFlags.is_nudged) {
            return row;
          }
          return {
            ...row,
            flags: { ...currentFlags, is_nudged: false },
          };
        }),
      );

      setSelection({});
      window.dispatchEvent(new CustomEvent("inbox:counts:refresh"));
      window.dispatchEvent(new CustomEvent("thread:flags:refresh"));
    } catch (error) {
      console.error("Failed to cancel nudges", error);
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, selection]);

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ThreadFilter value={tab} counts={statusCounts} onChange={handleTabChange} />
          <div className="flex flex-wrap items-center gap-3">
            <InboxFilterBar
              value={labelFilter}
              onChange={handleLabelChange}
              counts={campaignId ? labelCounts : null}
            />
            <Select value={assigneeFilter} onValueChange={handleAssigneeChange}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Assignee filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {assigneeOptions.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="ooo">OOO</SelectItem>
                <SelectItem value="unsub">Unsubscribed</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stateFilter} onValueChange={handleStateChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="needs_reply">Needs Reply</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {!campaignId && (
          <div className="text-sm text-muted-foreground">Select a campaign to view inbox threads.</div>
        )}
      </div>

      <NeedsResponse campaignId={campaignId || null} />
      <SearchResults campaignId={campaignId || null} />

      <BulkToolbar
        total={filteredRows.length}
        selectedCount={selectedIds.length}
        allSelected={allSelected}
        onToggleAll={(checked) => {
          setSelection((prev) => {
            const next = { ...prev };
            if (checked) {
              filteredRows.forEach((row) => {
                const id = resolveRowId(row);
                if (id) {
                  next[id] = true;
                }
              });
            } else {
              filteredRows.forEach((row) => {
                const id = resolveRowId(row);
                if (id) {
                  delete next[id];
                }
              });
            }
            return next;
          });
        }}
        onCancel={bulkCancel}
        disabled={bulkLoading || !campaignId}
      />

      <div className="rounded-md border">
        {!campaignId ? (
          <div className="p-6 text-sm text-muted-foreground">No campaign selected.</div>
        ) : loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No threads.</div>
        ) : (
          filteredRows.map((row: any) => {
            const id = resolveRowId(row);
            if (!id) {
              return null;
            }

            const flags = row.flags ?? {};
            const rowFlags = {
              is_nudged: Boolean(flags.is_nudged ?? row.is_nudged),
              is_snoozed: Boolean(flags.is_snoozed ?? row.is_snoozed ?? row.snoozed_until),
              last_outbound_at: flags.last_outbound_at ?? row.last_outbound_at ?? null,
            };

            return (
              <ThreadRow
                key={id}
                row={{
                  id,
                  subject: row.subject ?? row.last_preview ?? row.lead_email ?? "(no subject)",
                  updated_at:
                    row.updated_at ??
                    row.last_msg_at ??
                    row.last_inbound_at ??
                    row.created_at ??
                    new Date().toISOString(),
                  reply_type: row.reply_type ?? null,
                      replied_at: row.replied_at ?? null,
                      last_reply_intent: row.last_reply_intent ?? null,
                      lead_paused_until: row.lead_paused_until ?? null,
                      lead_paused_reason: row.lead_paused_reason ?? null,
                      latest_intent: row.latest_intent ?? null,
                      intent_subtype: row.intent_subtype ?? null,
                      intent_confidence: row.intent_confidence ?? null,
                      auto_paused: row.auto_paused ?? false,
                      state: row.state ?? "open",
                  flags: rowFlags,
                  selected: !!selection[id],
                  onSelectToggle: (checked) =>
                    setSelection((prev) => {
                      const next = { ...prev };
                      if (checked) {
                        next[id] = true;
                      } else {
                        delete next[id];
                      }
                      return next;
                    }),
                  onLocalUpdate: (patch) =>
                    setRows((prev) =>
                      prev.map((item: any) => {
                        const itemId = resolveRowId(item);
                        if (itemId !== id) {
                          return item;
                        }
                        const mergedFlags = { ...(item.flags ?? {}), ...patch };
                        return { ...item, flags: mergedFlags };
                      }),
                    ),
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function resolveRowId(row: any): string {
  return row?.id ?? row?.thread_id ?? "";
}

function computeLabelCounts(rows: any[]): InboxLabelCounts {
  const counts: InboxLabelCounts = { ...EMPTY_LABEL_COUNTS };
  rows.forEach((row) => {
    const label = (row?.reply_type ?? null) as string | null;
    if (!label) {
      counts.untyped += 1;
      return;
    }
    if (label in counts) {
      (counts as Record<string, number>)[label] += 1;
    } else {
      counts.untyped += 1;
    }
  });
  return counts;
}

function computeStatusCounts(rows: any[]): StatusCounts {
  return rows.reduce<StatusCounts>(
    (acc, row) => {
      acc.all += 1;
      const isNudged = Boolean(row?.flags?.is_nudged ?? row?.is_nudged);
      const isSnoozed = Boolean(row?.flags?.is_snoozed ?? row?.is_snoozed ?? row?.snoozed_until);
      const needsReply =
        row?.needs_reply !== undefined
          ? Boolean(row.needs_reply)
          : !isNudged && !isSnoozed;

      if (isNudged) {
        acc.nudged += 1;
      }
      if (isSnoozed) {
        acc.snoozed += 1;
      }
      if (needsReply) {
        acc.needs_reply += 1;
      }

      return acc;
    },
    { all: 0, needs_reply: 0, nudged: 0, snoozed: 0 },
  );
}

function matchesTab(row: any, tab: Tab): boolean {
  if (tab === "all") return true;
  const isNudged = Boolean(row?.flags?.is_nudged ?? row?.is_nudged);
  const isSnoozed = Boolean(row?.flags?.is_snoozed ?? row?.is_snoozed ?? row?.snoozed_until);
  const needsReply =
    row?.needs_reply !== undefined ? Boolean(row.needs_reply) : !isNudged && !isSnoozed;

  switch (tab) {
    case "needs_reply":
      return needsReply;
    case "nudged":
      return isNudged;
    case "snoozed":
      return isSnoozed;
    default:
      return true;
  }
}

function matchesLabel(row: any, filter: LabelFilter): boolean {
  if (filter === "all") return true;
  const label = (row?.reply_type ?? null) as string | null;
  if (filter === "untyped") {
    return label === null;
  }
  return label === filter;
}

function matchesState(row: any, filter: StateFilter): boolean {
  if (filter === "all") return true;
  const state = row?.state ?? "open";
  return state === filter;
}

function matchesStatus(row: any, filter: StatusFilter): boolean {
  if (filter === "all") return true;

  switch (filter) {
    case "replied":
      return Boolean(row?.replied_at);
    case "paused": {
      const pausedUntil = row?.lead_paused_until;
      if (!pausedUntil) return false;
      const ts = new Date(pausedUntil).getTime();
      return Number.isFinite(ts) && ts > Date.now();
    }
    case "ooo":
      return (row?.last_reply_intent ?? row?.reply_type) === "ooo";
    case "unsub":
      return (row?.last_reply_intent ?? row?.reply_type) === "unsubscribe";
    default:
      return true;
  }
}
