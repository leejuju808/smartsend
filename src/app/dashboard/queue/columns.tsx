"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type QueueRow = {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  attempt: number;
  max_attempts: number;
  scheduled_at: string;
  lead_timezone?: string | null;
  last_error?: string | null;
  throttled?: boolean;
  throttle_reason?: string | null;
  spam_risk?: number | null;
};

const statusColors: Record<string, { bg: string; text: string }> = {
  failed: { bg: "bg-red-500/15", text: "text-red-500" },
  queued: { bg: "bg-gray-500/15", text: "text-gray-600" },
  sending: { bg: "bg-amber-500/15", text: "text-amber-600" },
  sent: { bg: "bg-green-500/15", text: "text-green-600" },
  cancelled: { bg: "bg-slate-500/15", text: "text-slate-600" },
};

export const columns: ColumnDef<QueueRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(val) => table.toggleAllPageRowsSelected(!!val)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(val) => row.toggleSelected(!!val)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  },
  { 
    accessorKey: "to_email", 
    header: "Recipient",
    cell: ({ row }) => (
      <div className="font-medium">{row.original.to_email}</div>
    ),
  },
  { 
    accessorKey: "subject", 
    header: "Subject",
    cell: ({ row }) => (
      <div className="truncate max-w-[300px]">
        <div>{row.original.subject || "—"}</div>
        <div className="text-xs mt-1">
          {row.original.throttled ? (
            <span className="text-amber-600">THROTTLED — {row.original.throttle_reason}</span>
          ) : row.original.spam_risk !== null && row.original.spam_risk >= 0.55 ? (
            <span className="text-amber-600">Risk {(row.original.spam_risk * 100).toFixed(0)}%</span>
          ) : row.original.spam_risk !== null ? (
            <span className="text-muted-foreground">Risk {(row.original.spam_risk * 100).toFixed(0)}%</span>
          ) : null}
        </div>
      </div>
    ),
  },
  { 
    accessorKey: "status", 
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      const colors = statusColors[status] || { bg: "bg-gray-500/15", text: "text-gray-600" };
      return (
        <Badge variant="outline" className={`${colors.bg} ${colors.text} border-0`}>
          {status}
        </Badge>
      );
    },
  },
  { 
    accessorKey: "attempt", 
    header: "Attempt",
    cell: ({ row }) => (
      <span className="text-sm">{row.original.attempt}</span>
    ),
  },
  { 
    accessorKey: "max_attempts", 
    header: "Max",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.max_attempts}</span>
    ),
  },
  { 
    accessorKey: "scheduled_at", 
    header: "Scheduled",
    cell: ({ row }) => {
      const scheduledAt = row.original.scheduled_at;
      if (!scheduledAt) {
        return <span className="text-sm text-muted-foreground">—</span>;
      }

      const baseDate = new Date(scheduledAt);
      const localDisplay = baseDate.toLocaleString();

      let tooltipLabel = "Lead timezone not set";
      if (row.original.lead_timezone) {
        try {
          const formatter = new Intl.DateTimeFormat(undefined, {
            timeZone: row.original.lead_timezone,
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          tooltipLabel = `Scheduled At (local): ${formatter.format(baseDate)}`;
        } catch (error) {
          tooltipLabel = `Invalid timezone: ${row.original.lead_timezone}`;
        }
      }

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <span className="text-sm text-muted-foreground">{localDisplay}</span>
            </TooltipTrigger>
            <TooltipContent>{tooltipLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: "last_error",
    header: "Last error",
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ? (
        <span className="text-xs text-red-600">
          {val.slice(0, 120)}{val.length > 120 ? "…" : ""}
        </span>
      ) : null;
    },
  },
];

