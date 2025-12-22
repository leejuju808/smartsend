"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";

export type LeadRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  campaign_id: string | null;
  created_at: string;
  total_count?: number;
};

export const columns: ColumnDef<LeadRow>[] = [
  {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => {
      const allSelected = table.getIsAllPageRowsSelected();
      const someSelected = table.getIsSomePageRowsSelected();
      const checked = allSelected ? true : someSelected ? "indeterminate" : false;
      return (
        <Checkbox
          checked={checked}
          aria-label="Select all"
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        />
      );
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        aria-label={`Select lead ${row.original.email}`}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
      />
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => <div className="font-medium">{row.original.email}</div>,
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => <div>{row.original.company || "-"}</div>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">
        {row.original.status}
      </span>
    ),
  },
  {
    accessorKey: "attempts",
    header: "Attempts",
    cell: ({ row }) => `${row.original.attempts}/${row.original.max_attempts}`,
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => new Date(row.original.created_at).toLocaleString(),
  },
];

