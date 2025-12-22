"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  fn: string;
  total: number;
  lat_avg_ms: number;
  lat_p95_ms: number;
  ok_count: number;
  err5xx_count: number;
  success_rate: number;
};

export default function ClassifierHealthCard() {
  const [rows, setRows] = React.useState<Row[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/health/functions", { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data)) {
          setRows(
            data.filter((row): row is Row => typeof row?.fn === "string").map((row) => ({
              fn: row.fn,
              total: Number(row.total ?? 0),
              lat_avg_ms: Number(row.lat_avg_ms ?? 0),
              lat_p95_ms: Number(row.lat_p95_ms ?? 0),
              ok_count: Number(row.ok_count ?? 0),
              err5xx_count: Number(row.err5xx_count ?? 0),
              success_rate: Number(row.success_rate ?? 0),
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load classifier health", err);
      }
    })();
  }, []);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6 space-y-4">
        <h3 className="text-lg font-semibold">Classifier Health — last 24h</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Function</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Success</TableHead>
                <TableHead>5xx</TableHead>
                <TableHead>Latency avg</TableHead>
                <TableHead>Latency p95</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.fn}>
                  <TableCell className="font-medium">{r.fn}</TableCell>
                  <TableCell>{r.total}</TableCell>
                  <TableCell>{(r.success_rate * 100).toFixed(1)}%</TableCell>
                  <TableCell>{r.err5xx_count}</TableCell>
                  <TableCell>{r.lat_avg_ms} ms</TableCell>
                  <TableCell>{r.lat_p95_ms} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}







