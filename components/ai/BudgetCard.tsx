'use client';

import useSWR from 'swr';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function BudgetCard() {
  const { data } = useSWR('/api/ai/budget/today', fetcher, { refreshInterval: 15_000 });
  const spent = data?.spent ?? 0;
  const limit = data?.limit ?? 0;
  const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Budget — Today</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm">Spent: ${spent.toFixed?.(2) ?? spent} / ${limit.toFixed?.(2) ?? limit} ({pct}%)</div>
        <div className="h-2 bg-muted rounded mt-2">
          <div className="h-2 bg-primary rounded" style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
















