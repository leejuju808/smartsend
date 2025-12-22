// components/campaign/CampaignRecipientsTable.tsx
// Block 8140 — Recipients table (per-email status)

"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CampaignRecipientRow } from "@/lib/smartsend/campaign-send";
import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  MessageCircle,
} from "lucide-react";

type Props = {
  rows: CampaignRecipientRow[];
};

export function CampaignRecipientsTable({ rows }: Props) {
  const [replyFilter, setReplyFilter] = React.useState<string>("all");

  const filtered = React.useMemo(() => {
    if (replyFilter === "all") return rows;
    if (replyFilter === "replied") {
      return rows.filter((r) => r.reply_status === "replied");
    }
    if (replyFilter === "no-reply") {
      return rows.filter((r) => r.reply_status !== "replied");
    }
    // specific reply_type (positive/negative/etc.)
    return rows.filter((r) => r.last_reply_type === replyFilter);
  }, [rows, replyFilter]);

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        No recipients in the send queue yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="border-b px-4 py-3 text-sm font-medium flex items-center justify-between gap-3">
        <span>Recipients ({filtered.length}/{rows.length})</span>
        <ReplyFilter value={replyFilter} onChange={setReplyFilter} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Recipient</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reply</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Last Event</TableHead>
              <TableHead className="w-[260px]">Last Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.queue_id}>
                <TableCell className="text-sm font-medium">
                  {row.to_email}
                </TableCell>

                <TableCell>
                  <StatusBadge status={row.queue_status} />
                </TableCell>

                <TableCell>
                  <ReplyCell row={row} />
                </TableCell>

                <TableCell className="text-xs">
                  {row.attempts} / {row.max_attempts}
                </TableCell>

                <TableCell className="text-xs text-muted-foreground">
                  {row.last_event_at
                    ? format(new Date(row.last_event_at), "MMM d, HH:mm")
                    : row.sent_at
                    ? format(new Date(row.sent_at), "MMM d, HH:mm")
                    : "—"}
                </TableCell>

                <TableCell className="text-xs">
                  {row.last_event_error ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 truncate max-w-[240px] cursor-help">
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          <span className="truncate">
                            {row.last_event_error}
                          </span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {row.last_event_error}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();

  if (s === "sent") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/60">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <span>Sent</span>
      </Badge>
    );
  }

  if (s === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/60">
        <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        <span>Failed</span>
      </Badge>
    );
  }

  if (s === "retry") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/60">
        <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
        <span>Retry</span>
      </Badge>
    );
  }

  if (s === "processing") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-500/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
        <span>Processing</span>
      </Badge>
    );
  }

  if (s === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-muted-foreground/40">
        <CircleDotIcon />
        <span>Pending</span>
      </Badge>
    );
  }

  return <Badge variant="outline">{status}</Badge>;
}

function CircleDotIcon() {
  return (
    <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
      <span className="absolute inline-flex h-full w-full rounded-full border border-muted-foreground/40" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-muted-foreground" />
    </span>
  );
}

function ReplyCell({ row }: { row: CampaignRecipientRow }) {
  const type = row.last_reply_type;

  if (row.reply_status === "replied") {
    const snippet =
      (row.last_inbound_message || "").slice(0, 80) +
      ((row.last_inbound_message || "").length > 80 ? "…" : "");

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1.5 cursor-help max-w-[240px]">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/60 bg-emerald-500/5"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-medium">
                {type ? typeLabel(type) : "Replied"}
              </span>
            </Badge>
            {snippet ? (
              <span className="text-[11px] text-muted-foreground truncate">
                {snippet}
              </span>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-wrap text-xs">
          {row.last_inbound_message}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (row.reply_status === "ignore") {
    return (
      <Badge variant="outline" className="text-[11px]">
        Ignored
      </Badge>
    );
  }

  return <span className="text-xs text-muted-foreground">No reply</span>;
}

function typeLabel(type: string) {
  switch (type) {
    case "positive":
      return "Positive";
    case "neutral":
      return "Neutral";
    case "negative":
      return "Negative";
    case "ooh":
      return "Out of office";
    case "unsubscribe":
      return "Unsubscribe";
    default:
      return "Replied";
  }
}

function ReplyFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="h-8 rounded-md border bg-background px-2 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="all">All</option>
      <option value="replied">Replied</option>
      <option value="no-reply">No reply yet</option>
      <option value="positive">Positive</option>
      <option value="neutral">Neutral</option>
      <option value="negative">Negative</option>
      <option value="ooh">Out of office</option>
      <option value="unsubscribe">Unsubscribe</option>
    </select>
  );
}

