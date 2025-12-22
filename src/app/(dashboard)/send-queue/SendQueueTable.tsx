"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type SendLog = {
  id: string;
  lead_email: string;
  subject: string | null;
  status: "queued" | "sent" | "failed" | "replied";
  last_error: string | null;
  retry_count: number;
  open_count: number;
  click_count: number;
  last_open_at: string | null;
  last_click_at: string | null;
  updated_at: string;
};

type Props = {
  data: SendLog[];
  // Optional refetch when changes land
  onRefetch?: () => Promise<void> | void;
};

const columns: ColumnDef<SendLog>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    size: 32,
  },
  {
    accessorKey: "lead_email",
    header: "Lead",
    cell: ({ row }) => (
      <div className="truncate max-w-[220px]">{row.original.lead_email}</div>
    ),
  },
  {
    accessorKey: "subject",
    header: "Subject",
    cell: ({ row }) => (
      <span title={row.original.subject ?? "—"} className="truncate max-w-[300px] text-muted-foreground block">
        {row.original.subject ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status;
      const color =
        s === "failed"
          ? "bg-red-500/15 text-red-500"
          : s === "queued"
          ? "bg-yellow-500/15 text-yellow-600"
          : s === "sent"
          ? "bg-emerald-500/15 text-emerald-600"
          : "bg-blue-500/15 text-blue-600"; // replied
      return (
        <span className={`px-2 py-1 rounded-md text-xs font-medium ${color}`}>
          {s}
        </span>
      );
    },
  },
  {
    accessorKey: "open_count",
    header: "Opens",
    cell: ({ row }) => (
      <span className="text-xs">{row.original.open_count ?? 0}</span>
    ),
  },
  {
    accessorKey: "click_count",
    header: "Clicks",
    cell: ({ row }) => (
      <span className="text-xs">{row.original.click_count ?? 0}</span>
    ),
  },
  {
    accessorKey: "last_open_at",
    header: "Last Open",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.last_open_at ? new Date(row.original.last_open_at).toLocaleString() : "—"}
      </span>
    ),
  },
  {
    accessorKey: "last_click_at",
    header: "Last Click",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.last_click_at ? new Date(row.original.last_click_at).toLocaleString() : "—"}
      </span>
    ),
  },
  {
    accessorKey: "retry_count",
    header: "Attempts",
    cell: ({ row }) => {
      const a = row.original.retry_count ?? 0;
      return <span className="text-xs text-muted-foreground">{a}</span>;
    },
  },
  {
    accessorKey: "updated_at",
    header: "Updated",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {new Date(row.original.updated_at).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "last_error",
    header: "Last Error",
    cell: ({ row }) => (
      <div className="truncate max-w-[340px] text-xs text-destructive">
        {row.original.last_error ?? "—"}
      </div>
    ),
  },
];

export default function SendQueueTable({ data, onRefetch }: Props) {
  const [rowSelection, setRowSelection] = React.useState({});
  const table = useReactTable({
    data,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedIds = React.useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original.id),
    [rowSelection, table]
  );

  const anySelected = selectedIds.length > 0;

  const retrySelected = async () => {
    try {
      const res = await fetch("/api/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to retry");
      }
      toast.success(`Queued ${selectedIds.length} for retry`);
      setRowSelection({});
      await onRefetch?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Retry failed");
    }
  };

  return (
    <div className="space-y-3">
      {/* Selection toolbar (only shows when items selected) */}
      {anySelected ? (
        <div className="flex items-center justify-between rounded-lg border p-2 bg-card">
          <div className="text-sm">
            <span className="font-medium">{selectedIds.length}</span> selected
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRowSelection({})}>
              Clear
            </Button>
            <Button size="sm" onClick={retrySelected}>
              Retry Selected
            </Button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2 text-left font-medium">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={row.getIsSelected() ? "bg-muted/40" : ""}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
