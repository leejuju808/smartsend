"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ConfRow = { actual_label: string; predicted_label: string; n: number };
type AccRow = { accuracy: number; total: number };
type PRRow = { label: string; precision: number | null; recall: number | null; support: number };

export default function ReplyClassifierCard() {
  const [acc, setAcc] = React.useState<AccRow | null>(null);
  const [goldAcc, setGoldAcc] = React.useState<AccRow | null>(null);
  const [conf, setConf] = React.useState<ConfRow[]>([]);
  const [pr, setPr] = React.useState<PRRow[]>([]);
  const [runId, setRunId] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/qa/latest", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRunId(data.run_id ?? null);
      setAcc(data.accuracy ?? null);
      setGoldAcc(data.gold_accuracy ?? null);
      setConf(Array.isArray(data.confusion) ? data.confusion : []);
      setPr(Array.isArray(data.pr) ? data.pr : []);
    })();
  }, []);

  const labels = ["positive", "neutral", "question", "negative", "ooo"];
  const confMap = React.useMemo(() => {
    const map = new Map<string, number>();
    conf.forEach((row) => {
      map.set(`${row.actual_label}|${row.predicted_label}`, row.n);
    });
    return map;
  }, [conf]);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">
            Reply Classifier — QA ({runId ?? "…"})
          </h3>
          <div className="text-sm opacity-80 space-x-4">
            <span>
              Accuracy:{" "}
              <span className="font-medium">
                {acc ? (acc.accuracy * 100).toFixed(1) : "–"}%
              </span>
              <span className="ml-2">n={acc?.total ?? "–"}</span>
            </span>
            <span>
              Gold:{" "}
              <span className="font-medium">
                {goldAcc ? (goldAcc.accuracy * 100).toFixed(1) : "–"}%
              </span>
              <span className="ml-2">n={goldAcc?.total ?? "–"}</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Actual \ Pred</TableHead>
                {labels.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {labels.map((actual) => (
                <TableRow key={actual}>
                  <TableCell className="font-medium">{actual}</TableCell>
                  {labels.map((predicted) => (
                    <TableCell key={predicted} className="text-center">
                      {confMap.get(`${actual}|${predicted}`) ?? 0}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Precision</TableHead>
                <TableHead>Recall</TableHead>
                <TableHead>Support</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pr.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>
                    {row.precision !== null
                      ? `${(row.precision * 100).toFixed(1)}%`
                      : "–"}
                  </TableCell>
                  <TableCell>
                    {row.recall !== null
                      ? `${(row.recall * 100).toFixed(1)}%`
                      : "–"}
                  </TableCell>
                  <TableCell>{row.support}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}







