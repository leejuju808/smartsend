"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";

export interface NotificationRow {
  id: string;
  type: string;
  channel: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  seen_at: string | null;
  created_at: string;
  campaign_id: string;
  campaign_name: string;
  lead_id: string;
  lead_name: string | null;
  lead_email: string;
  payload: Record<string, any> | null;
  campaign_lead_id: string;
}

interface NotificationsTableProps {
  rows: NotificationRow[];
}

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

const typeOptions = [
  { value: "all", label: "All types" },
  { value: "hot_lead", label: "Hot lead" },
  { value: "reply", label: "Reply" },
  { value: "unsubscribe", label: "Unsubscribe" },
];

export function NotificationsTable({ rows }: NotificationsTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (typeFilter !== "all" && row.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const haystack = `${row.lead_email} ${row.lead_name ?? ""} ${
          row.campaign_name
        }`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, typeFilter, search]);

  const handleMarkSeen = async (id: string) => {
    try {
      setLoadingId(id);
      const res = await fetch(`/api/notifications/${id}/seen`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("Failed to mark notification as seen");
      } else {
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const renderSummarySnippet = (row: NotificationRow) => {
    const p = row.payload ?? {};
    const summary = p.summary as string | undefined;
    const nextAction = p.next_action as string | undefined;
    const intent = p.last_reply_intent as string | undefined;
    const stage = p.stage as string | undefined;

    if (!summary && !nextAction && !intent && !stage) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    return (
      <div className="space-y-1">
        {summary && (
          <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {intent && (
            <Badge variant="outline" className="text-[10px]">
              intent: {intent}
            </Badge>
          )}
          {stage && (
            <Badge variant="outline" className="text-[10px]">
              stage: {stage}
            </Badge>
          )}
          {nextAction && (
            <span className="text-[10px] text-muted-foreground line-clamp-1">
              next: {nextAction}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search by email or campaign..."
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={() => location.reload()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-sm">
                  No notifications match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const isSeen = !!row.seen_at;
                const isLoading = loadingId === row.id;
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      !isSeen && "bg-amber-50/40 dark:bg-amber-900/10"
                    )}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {row.lead_name || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.lead_email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium">
                        {row.campaign_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={
                            row.status === "failed"
                              ? "destructive"
                              : row.status === "pending"
                              ? "secondary"
                              : "default"
                          }
                          className="text-[10px]"
                        >
                          {row.status}
                        </Badge>
                        {row.error && (
                          <span className="text-[10px] text-destructive line-clamp-1">
                            {row.error}
                          </span>
                        )}
                        {isSeen && (
                          <span className="text-[10px] text-muted-foreground">
                            seen
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{renderSummarySnippet(row)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/campaigns/${row.campaign_id}?lead=${row.lead_id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View lead
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <Button
                          variant={isSeen ? "ghost" : "outline"}
                          size="xs"
                          disabled={isLoading}
                          onClick={() => handleMarkSeen(row.id)}
                          className="text-xs"
                        >
                          {isLoading ? (
                            "Marking..."
                          ) : (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {isSeen ? "Seen" : "Mark seen"}
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

