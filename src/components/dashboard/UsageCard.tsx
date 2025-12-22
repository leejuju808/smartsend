"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UsageRow = {
  event_type: string;
  month: string;
  qty: number;
};

interface UsageCardProps {
  userId: string;
}

export default function UsageCard({ userId }: UsageCardProps) {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    setIsLoading(true);
    fetch(`/rest/v_usage_monthly?user_id=eq.${userId}&select=*`, {
      headers: { accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setIsLoading(false));
  }, [userId]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + (row.qty ?? 0), 0), [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage This Month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-2xl font-semibold">
          {isLoading ? "…" : `${total.toLocaleString()} sends`}
        </div>
        {!isLoading && rows.length === 0 && (
          <div className="text-muted-foreground">No usage recorded yet.</div>
        )}
        {!isLoading && rows.map((row) => (
          <div key={row.event_type} className="flex items-center justify-between">
            <span className="capitalize">{row.event_type}</span>
            <span>{row.qty.toLocaleString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}












