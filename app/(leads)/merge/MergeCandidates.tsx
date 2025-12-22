"use client";

import * as React from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MergeSheet } from "./MergeSheet";

type CandidatePair = {
  id: string;
  lead_id_a: string;
  lead_id_b: string;
  reason: string;
  score: number;
  a: Record<string, unknown>;
  b: Record<string, unknown>;
};

export default function MergeCandidates({ accountId }: { accountId: string }) {
  const { data, mutate } = useSWR(
    `/api/merge/candidates?account=${accountId}`,
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: 10_000 }
  );

  const items: CandidatePair[] = data?.items ?? [];
  const [open, setOpen] = React.useState(false);
  const [pair, setPair] = React.useState<CandidatePair | null>(null);

  return (
    <div className="grid gap-2">
      {items.map((row) => (
        <Card key={row.id} className="p-3 text-sm flex items-center justify-between">
          <div className="truncate">
            <div className="font-medium">
              {row.a?.first_name as string | undefined} {row.a?.last_name as string | undefined} —{" "}
              {row.a?.email as string | undefined}
            </div>
            <div className="text-xs opacity-70">
              vs {row.b?.first_name as string | undefined} {row.b?.last_name as string | undefined} —{" "}
              {row.b?.email as string | undefined}
            </div>
            <div className="text-xs opacity-70 flex gap-2 mt-1">
              <Badge variant="secondary">{row.reason}</Badge>
              <span>score {Math.floor((row.score ?? 0) * 100)}%</span>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setPair(row);
              setOpen(true);
            }}
          >
            Review
          </Button>
        </Card>
      ))}

      {pair && (
        <MergeSheet
          open={open}
          onOpenChange={setOpen}
          pair={pair}
          accountId={accountId}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}

