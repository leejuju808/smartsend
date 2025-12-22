"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";

type LeadsResponse = {
  ok: boolean;
  total: number;
  page: number;
  pageSize: number;
  rows: Record<string, any>[];
  columns: string[];
};

export function ViewTable({ viewId }: { viewId: string }) {
  const [page, setPage] = useState(1);

  const { data } = useSWR<LeadsResponse>(
    viewId ? `/api/saved-views/${viewId}/leads?page=${page}` : null,
    (url) => fetch(url).then((res) => res.json()),
    { keepPreviousData: true }
  );

  if (!viewId) return null;
  if (!data) return <div className="text-sm opacity-60">Loading…</div>;

  const columns = data.columns?.length ? data.columns : ["display_name", "email", "company_name", "company_size", "company_industry"];

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-3">
          <div className="text-sm opacity-70">Rows: {data.total}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <Button size="sm" onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
        <Table>
          <Thead>
            <Tr>
              {columns.map((col) => (
                <Th key={col} className="capitalize">
                  {col.replaceAll("_", " ")}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {(data.rows ?? []).map((row) => (
              <Tr key={row.id}>
                {columns.map((col) => {
                  const value = row[col];
                  if (col === "company_tech") {
                    return (
                      <Td key={col} className="max-w-[360px]">
                        {(value ?? []).map((tech: string) => (
                          <Badge key={tech} variant="secondary" className="mr-1">
                            {tech}
                          </Badge>
                        ))}
                      </Td>
                    );
                  }
                  return <Td key={col}>{renderCell(value)}</Td>;
                })}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </CardContent>
    </Card>
  );
}

function renderCell(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

