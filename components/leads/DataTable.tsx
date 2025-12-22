"use client";

import { DataTable as UiDataTable } from "@/components/ui/data-table";
import { columns, type LeadRow } from "./columns";

type Props = {
  data: any[];
  onSelectionChange?: (ids: string[]) => void;
};

export function DataTable({ data, onSelectionChange }: Props) {
  return (
    <UiDataTable
      columns={columns}
      data={data as LeadRow[]}
      onSelectionChange={onSelectionChange}
    />
  );
}

