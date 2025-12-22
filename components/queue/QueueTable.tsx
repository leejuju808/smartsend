"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectionToolbar } from "./SelectionToolbar";
import { StatusPill } from "@/components/ui/status-pill";
import { RowActions } from "./RowActions";
import { JobDetailsDrawer } from "./JobDetailsDrawer";

export type QueueRow = {
  id: string;
  lead_id?: string;
  status: "queued" | "sending" | "sent" | "failed" | "canceled";
  attempt_count: number;
  max_attempts: number;
  last_error?: string;
  lead_email?: string;
  campaign_id?: string;
  campaign_name?: string;
  updated_at?: string;
};

export function QueueTable({
  data,
  onRefetch,
}: {
  data: QueueRow[];
  onRefetch: () => void;
}) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const columns = React.useMemo<ColumnDef<QueueRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 48,
      },
      { accessorKey: "lead_email", header: "Lead", cell: (ctx) => ctx.getValue() as string },
      { accessorKey: "campaign_name", header: "Campaign" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: "attempts",
        header: "Attempts",
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs">
            {row.original.attempt_count}/{row.original.max_attempts}
          </span>
        ),
      },
      { accessorKey: "updated_at", header: "Updated" },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => <RowActions row={row.original} onRefetch={onRefetch} />,
        enableSorting: false,
        size: 48,
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: () => true,
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [activeQueueId, setActiveQueueId] = React.useState<string | null>(null);
  const openDetails = (id: string) => { setActiveQueueId(id); setDetailsOpen(true); };

  return (
    <div className="w-full">
      {selectedRows.length > 0 && (
        <SelectionToolbar
          selected={selectedRows}
          onCleared={() => setRowSelection({})}
          onRefetch={onRefetch}
        />
      )}

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-[var(--toolbar-offset,0px)] bg-background">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 text-left font-medium">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b hover:bg-muted/40 cursor-pointer"
                onClick={() => openDetails(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <JobDetailsDrawer open={detailsOpen} onOpenChange={setDetailsOpen} queueId={activeQueueId} />
    </div>
  );
}


