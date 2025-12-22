"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
  RowSelectionState,
} from "@tanstack/react-table";

type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  data: T[];
  onSelectionChange?: (ids: string[]) => void;
  rowId?: keyof T | ((row: T) => string);
  pageSize?: number;
};

export function DataTable<T>({
  columns,
  data,
  onSelectionChange,
  rowId = "id" as keyof T,
  pageSize = 50,
}: DataTableProps<T>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const getRowId = React.useCallback(
    (row: T) => {
      if (typeof rowId === "function") {
        return rowId(row);
      }
      return String(row[rowId]);
    },
    [rowId]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId,
  });

  React.useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table.getSelectedRowModel().rows;
      const ids = selectedRows.map((row) => getRowId(row.original));
      onSelectionChange(ids);
    }
  }, [rowSelection, table, onSelectionChange, getRowId]);

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
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
  );
}

