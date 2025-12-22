// app/(dashboard)/inbox/_components/reply-inbox-table.tsx
// Block 9400 — Bulk Actions Engine

"use client";

import * as React from "react";
import Link from "next/link";
import {
  Flame,
  Filter,
  CheckCircle2,
  Circle,
  ShieldAlert,
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  QuickReplySheet,
  QuickReplyContext,
} from "./quick-reply-sheet";
import { BulkActionBar } from "./BulkActionBar";

export interface ReplyInboxRow {
  reply_id: string;
  campaign_id: string;
  campaign_name: string | null;
  lead_id: string;
  lead_email: string;
  lead_name: string | null;
  intent: string | null;
  sentiment: string | null;
  received_at: string;
  thread_summary: string | null;
  handled_at: string | null;
  is_hot_lead: boolean;
  is_suppressed?: boolean;
}

interface ReplyInboxTableProps {
  rows: ReplyInboxRow[];
}

const INTENT_FILTERS = [
  "all",
  "hot",
  "positive",
  "referral",
  "neutral",
  "negative",
  "unsubscribe",
  "bounce",
  "spam",
];

export function ReplyInboxTable({ rows }: ReplyInboxTableProps) {
  const [search, setSearch] = React.useState("");
  const [intentFilter, setIntentFilter] = React.useState<string>("hot");
  const [showUnHandledOnly, setShowUnHandledOnly] = React.useState(true);
  const [pendingUpdate, setPendingUpdate] = React.useState<string | null>(null);
  const [localRows, setLocalRows] = React.useState(rows);
  const [quickReplyOpen, setQuickReplyOpen] = React.useState(false);
  const [quickReplyContext, setQuickReplyContext] =
    React.useState<QuickReplyContext | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);

  React.useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const filtered = React.useMemo(() => {
    let data = localRows;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      data = data.filter((r) => {
        const haystack = `${r.lead_email} ${r.lead_name ?? ""} ${
          r.campaign_name ?? ""
        } ${r.thread_summary ?? ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    if (showUnHandledOnly) {
      data = data.filter((r) => !r.handled_at);
    }

    if (intentFilter === "hot") {
      data = data.filter((r) => r.is_hot_lead);
    } else if (intentFilter !== "all") {
      data = data.filter((r) => r.intent === intentFilter);
    }

    return data;
  }, [localRows, search, intentFilter, showUnHandledOnly]);

  const handleToggleHandled = async (
    replyId: string,
    currentHandled: boolean
  ) => {
    setPendingUpdate(replyId);
    try {
      const res = await fetch(`/api/replies/${replyId}/handle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled: !currentHandled }),
      });

      if (!res.ok) {
        console.error("Failed to update handled state");
        return;
      }

      setLocalRows((prev) =>
        prev.map((r) =>
          r.reply_id === replyId
            ? {
                ...r,
                handled_at: !currentHandled ? new Date().toISOString() : null,
              }
            : r
        )
      );
    } finally {
      setPendingUpdate(null);
    }
  };

  const openQuickReply = (row: ReplyInboxRow) => {
    const ctx: QuickReplyContext = {
      replyId: row.reply_id,
      leadEmail: row.lead_email,
      leadName: row.lead_name,
      campaignName: row.campaign_name ?? undefined,
      intent: row.intent,
      threadSummary: row.thread_summary ?? undefined,
    };
    setQuickReplyContext(ctx);
    setQuickReplyOpen(true);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
    if (!bulkMode && newSelected.size > 0) {
      setBulkMode(true);
    }
    if (newSelected.size === 0) {
      setBulkMode(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
      setBulkMode(false);
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.reply_id)));
      setBulkMode(true);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const performBulkAction = async (action: any) => {
    if (selectedIds.size === 0) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/replies/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadIds: Array.from(selectedIds),
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "Bulk action failed");
        return;
      }
      // Optimistic update - refresh data
      setLocalRows((prev) =>
        prev.map((r) => {
          if (selectedIds.has(r.reply_id)) {
            if (action.type === "mark_read") {
              return { ...r, handled_at: new Date().toISOString() };
            } else if (action.type === "mark_unread") {
              return { ...r, handled_at: null };
            } else if (action.type === "intent") {
              return { ...r, intent: action.value };
            }
          }
          return r;
        })
      );
      clearSelection();
    } catch (error) {
      console.error("Bulk action error:", error);
      alert("Failed to perform bulk action");
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkRead = async () => {
    await performBulkAction({ type: "mark_read" });
  };

  const handleMarkUnread = async () => {
    await performBulkAction({ type: "mark_unread" });
  };

  const handleArchive = async () => {
    await performBulkAction({ type: "archive" });
  };

  const handleChangeIntent = async (intent: "hot" | "warm" | "follow_up" | "not_interested") => {
    await performBulkAction({ type: "intent", value: intent });
  };

  const handleAssignOwner = async (ownerId: string) => {
    await performBulkAction({ type: "assign_owner", ownerId });
  };

  const totalReplies = rows.length;
  const totalHot = rows.filter((r) => r.is_hot_lead).length;
  const totalUnhandledHot = rows.filter(
    (r) => r.is_hot_lead && !r.handled_at
  ).length;

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            {totalReplies} replies
          </Badge>
          <Badge variant="default" className="text-[11px] flex items-center gap-1">
            <Flame className="h-3 w-3" />
            {totalHot} hot
          </Badge>
          {totalUnhandledHot > 0 && (
            <span className="text-[11px] text-amber-600">
              {totalUnhandledHot} hot replies unhandled
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Input
            placeholder="Search lead, campaign, summary…"
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex items-center gap-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value)}
            >
              {INTENT_FILTERS.map((f) => (
                <option key={f} value={f}>
                  {f === "all"
                    ? "All intents"
                    : f === "hot"
                    ? "Hot (positive/referral)"
                    : f}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            variant={showUnHandledOnly ? "default" : "outline"}
            size="sm"
            className="text-[11px]"
            onClick={() => setShowUnHandledOnly((v) => !v)}
          >
            {showUnHandledOnly ? "Showing unhandled" : "Showing all"}
          </Button>
          {!bulkMode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[11px]"
              onClick={() => setBulkMode(true)}
            >
              Select
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {bulkMode && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
              )}
              <TableHead className="w-10"></TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={bulkMode ? 8 : 7} className="py-6 text-center text-sm">
                  No replies match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const handled = !!r.handled_at;
                return (
                  <TableRow key={r.reply_id}>
                    {bulkMode && (
                      <TableCell className="align-middle">
                        <Checkbox
                          checked={selectedIds.has(r.reply_id)}
                          onCheckedChange={() => toggleSelect(r.reply_id)}
                        />
                      </TableCell>
                    )}
                    {/* Handle toggle */}
                    <TableCell className="align-middle">
                      <button
                        className="inline-flex items-center justify-center"
                        onClick={() => handleToggleHandled(r.reply_id, handled)}
                        disabled={pendingUpdate === r.reply_id}
                      >
                        {handled ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>

                    {/* Lead */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {r.lead_name || r.lead_email}
                        </span>
                        {r.lead_name && (
                          <span className="text-xs text-muted-foreground">
                            {r.lead_email}
                          </span>
                        )}
                        <Link
                          href={`/leads/${r.lead_id}`}
                          className="text-[11px] text-primary hover:underline mt-0.5"
                        >
                          View lead
                        </Link>
                      </div>
                    </TableCell>

                    {/* Campaign + flags */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">
                          {r.campaign_name || "Campaign"}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {r.is_hot_lead && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                              <Flame className="h-3 w-3" />
                              Hot lead
                            </span>
                          )}
                          {r.is_suppressed && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-600">
                              <ShieldAlert className="h-3 w-3" />
                              Suppressed
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Intent */}
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px]",
                          r.intent === "positive" || r.intent === "referral"
                            ? "bg-emerald-100 text-emerald-700"
                            : r.intent === "negative" ||
                              r.intent === "unsubscribe" ||
                              r.intent === "spam"
                            ? "bg-red-100 text-red-700"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {r.intent || "unknown"}
                      </span>
                      {r.sentiment && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          {r.sentiment}
                        </span>
                      )}
                    </TableCell>

                    {/* Summary */}
                    <TableCell>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {r.thread_summary || "No summary available yet."}
                      </p>
                    </TableCell>

                    {/* Received */}
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(r.received_at).toLocaleString()}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openQuickReply(r)}
                        disabled={r.is_suppressed}
                        title={
                          r.is_suppressed
                            ? "This lead is globally suppressed."
                            : "Reply"
                        }
                      >
                        <Reply className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Quick Reply Sheet */}
      <QuickReplySheet
        open={quickReplyOpen}
        onOpenChange={setQuickReplyOpen}
        context={quickReplyContext}
      />

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onMarkRead={handleMarkRead}
        onMarkUnread={handleMarkUnread}
        onArchive={handleArchive}
        onChangeIntent={handleChangeIntent}
        onAssignOwner={handleAssignOwner}
        onClearSelection={clearSelection}
      />
    </div>
  );
}

