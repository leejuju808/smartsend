"use client";

import * as React from "react";
import {
  listLeads,
  type LeadRow,
  type LeadListFilters,
} from "@/app/api/leads/list/actions";
import {
  listSegmentsMin,
  type SegmentMin,
} from "@/app/api/segments/list-min/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Users,
  MailCheck,
  MessageCircle,
  XCircle,
  Search,
  Target,
} from "lucide-react";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { useRole } from "@/lib/hooks/useRole";

type StatusFilter = NonNullable<LeadListFilters["status"]>;

interface LeadsTableProps {
  accountId: string;
}

function statusBadge(status: LeadRow["email_status"]) {
  switch (status) {
    case "active":
      return <Badge className="bg-emerald-500/15 text-emerald-600">Active</Badge>;
    case "replied":
      return <Badge className="bg-blue-500/15 text-blue-600">Replied</Badge>;
    case "unsubscribed":
      return <Badge className="bg-red-500/15 text-red-600">Unsubscribed</Badge>;
    case "bounced":
      return <Badge className="bg-slate-500/15 text-slate-600">Bounced</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export function LeadsTable({ accountId }: LeadsTableProps) {
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");

  const [segments, setSegments] = React.useState<SegmentMin[]>([]);
  const [segmentsLoading, setSegmentsLoading] = React.useState(false);
  const [segmentFilter, setSegmentFilter] = React.useState<string | null>(null);

  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);

  const role = useRole();

  async function refresh(opts?: { keepLoading?: boolean }) {
    if (!opts?.keepLoading) setLoading(true);
    try {
      const data = await listLeads(accountId, {
        status,
        search,
        segmentId: segmentFilter,
      });
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!opts?.keepLoading) setLoading(false);
    }
  }

  // Initial leads load
  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Load segments for filter
  React.useEffect(() => {
    let cancelled = false;
    async function loadSegments() {
      setSegmentsLoading(true);
      try {
        const data = await listSegmentsMin(accountId);
        if (!cancelled) setSegments(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setSegmentsLoading(false);
      }
    }
    loadSegments();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Re-run when status, search, or segment changes (debounce search)
  React.useEffect(() => {
    const handle = setTimeout(() => {
      refresh();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, segmentFilter]);

  const total = rows.length;
  const repliedCount = rows.filter((r) => r.email_status === "replied").length;
  const unsubCount = rows.filter((r) => r.email_status === "unsubscribed").length;
  const bounceCount = rows.filter((r) => r.email_status === "bounced").length;

  function openLead(id: string) {
    setSelectedLeadId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Leads</h1>
            <p className="text-xs text-muted-foreground">
              All leads for this account, with reply status and segment filter.
            </p>
          </div>
        </div>
        {loading && (
          <span className="inline-flex items-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Loading…
          </span>
        )}
      </div>

      {/* Filters strip */}
      <Card className="border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status pills */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground mr-2">Email status</span>
            {(["all", "active", "replied", "unsubscribed", "bounced"] as StatusFilter[]).map(
              (s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={s === status ? "default" : "outline"}
                  className={cn(
                    "h-7 px-2 text-[11px]",
                    s === status && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setStatus(s)}
                >
                  {s === "all" && "All"}
                  {s === "active" && "Active"}
                  {s === "replied" && "Replied"}
                  {s === "unsubscribed" && "Unsubscribed"}
                  {s === "bounced" && "Bounced"}
                </Button>
              )
            )}
          </div>

          {/* Segment select */}
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={segmentFilter ?? "___ALL"}
              onValueChange={(val) => {
                if (val === "___ALL") setSegmentFilter(null);
                else setSegmentFilter(val);
              }}
              disabled={segmentsLoading}
            >
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="All segments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="___ALL">All segments</SelectItem>
                {segments.map((seg) => (
                  <SelectItem key={seg.id} value={seg.id}>
                    {seg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search box */}
          <div className="ml-auto flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="relative">
              <Input
                className="h-8 w-[220px] pr-6 text-xs"
                placeholder="Search email, name, company…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setSearch(searchInput);
                  }
                }}
                onBlur={() => {
                  setSearch(searchInput);
                }}
              />
              {search && (
                <button
                  type="button"
                  className="absolute inset-y-0 right-1 flex items-center text-[10px] text-muted-foreground"
                  onClick={() => {
                    setSearch("");
                    setSearchInput("");
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats strip */}
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" /> Total leads
          </p>
          <p className="mt-1 text-lg font-semibold">{total}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageCircle className="h-3 w-3 text-blue-500" /> Replied
          </p>
          <p className="mt-1 text-lg font-semibold">{repliedCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-500" /> Unsubscribed
          </p>
          <p className="mt-1 text-lg font-semibold">{unsubCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MailCheck className="h-3 w-3 text-slate-500" /> Bounced
          </p>
          <p className="mt-1 text-lg font-semibold">{bounceCount}</p>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selected.length > 0 && role && role !== "viewer" && (
        <div className="flex gap-3 mb-3 text-xs items-center">
          <div>{selected.length} selected</div>

          {/* Bulk Status */}
          <select
            className="border p-1 rounded"
            onChange={async (e) => {
              if (!e.target.value) return;

              await fetch("/api/leads/batch/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: selected, status: e.target.value }),
              });

              refresh();
              setSelected([]);
            }}
          >
            <option value="">Set status…</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="engaged">Engaged</option>
            <option value="customer">Customer</option>
            <option value="invalid">Invalid</option>
          </select>

          {/* Bulk Tag */}
          <input
            type="text"
            placeholder="Add tag…"
            className="border p-1 rounded"
            onKeyDown={async (e: any) => {
              if (e.key === "Enter") {
                await fetch("/api/leads/batch/tags", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: selected, tag: e.target.value }),
                });
                refresh();
                setSelected([]);
                e.target.value = "";
              }
            }}
          />

          {/* Bulk Delete (admin/owner only) */}
          {(role === "admin" || role === "owner") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                if (!confirm(`Are you sure you want to delete ${selected.length} lead(s)?`)) {
                  return;
                }
                await fetch("/api/leads/batch/delete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids: selected }),
                });
                refresh();
                setSelected([]);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <Card className="border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold">{rows.length}</span> leads.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No leads in this view yet.
          </div>
        ) : (
          <div className="max-h-[540px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    <input
                      type="checkbox"
                      checked={selected.length === rows.length && rows.length > 0}
                      onChange={() =>
                        setSelected(
                          selected.length === rows.length
                            ? []
                            : rows.map((l) => l.id)
                        )
                      }
                      className="cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Lead</th>
                  <th className="px-3 py-2 text-left font-semibold">Company / Title</th>
                  <th className="px-3 py-2 text-left font-semibold">Location</th>
                  <th className="px-3 py-2 text-left font-semibold">Email status</th>
                  <th className="px-3 py-2 text-left font-semibold">Last reply</th>
            </tr>
          </thead>
          <tbody>
                {rows.map((lead) => (
                  <tr
                    key={lead.id}
                    className={cn("border-t cursor-pointer hover:bg-muted/40")}
                    onClick={() => openLead(lead.id)}
                  >
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected.includes(lead.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelected((prev) =>
                            prev.includes(lead.id)
                              ? prev.filter((x) => x !== lead.id)
                              : [...prev, lead.id]
                          );
                        }}
                        className="cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {[lead.first_name, lead.last_name]
                            .filter(Boolean)
                            .join(" ") || "Unnamed"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {lead.email || "no-email@example.com"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate max-w-[200px]">
                          {lead.company || "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                          {lead.title || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-[11px] text-muted-foreground">
                        {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {statusBadge(lead.email_status)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {lead.last_reply_at ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(lead.last_reply_at).toLocaleString()}
                          </span>
                          {lead.last_reply_kind && (
                            <span className="text-[10px] text-muted-foreground">
                              Kind: {lead.last_reply_kind}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        )}
      </Card>

      <LeadDetailDrawer
        leadId={selectedLeadId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
