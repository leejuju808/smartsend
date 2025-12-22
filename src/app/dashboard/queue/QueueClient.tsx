"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { columns, QueueRow } from "./columns";
import SelectionToolbar from "./SelectionToolbar";
import { useRouter } from "next/navigation";

export default function QueueClient({ initialRows }: { initialRows: QueueRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [selectedRows, setSelectedRows] = useState<QueueRow[]>([]);
  const router = useRouter();

  const refresh = () => router.refresh();

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-2xl font-semibold">
        Send Queue {rows.length > 0 && <span className="text-muted-foreground">· {rows.length}</span>}
      </h1>
      <SelectionToolbar
        selected={selectedRows.map((r) => ({
          id: r.id,
          attempt: r.attempt,
          max_attempts: r.max_attempts,
          status: r.status,
        }))}
        refresh={refresh}
      />
      <DataTable
        columns={columns}
        data={rows}
        onSelectionChange={(ids: string[]) => {
          const map = new Map(rows.map((r) => [r.id, r]));
          setSelectedRows(ids.map((id) => map.get(id)!).filter(Boolean));
        }}
        rowId="id"
        pageSize={50}
      />
    </div>
  );
}

