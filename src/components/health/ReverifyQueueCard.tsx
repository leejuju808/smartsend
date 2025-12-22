"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type QueueItem = {
  id: string;
  email: string;
  lead_id: string | null;
  status: "queued" | "processing" | "verified" | "invalid" | "error";
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
};

const statusVariant: Record<QueueItem["status"], "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  processing: "default",
  verified: "outline",
  invalid: "destructive",
  error: "destructive",
};

export default function ReverifyQueueCard() {
  const { data, isLoading } = useSWR<QueueItem[]>(
    "/api/reverify",
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 30_000 },
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Reverify Queue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-4/6" />
          </>
        )}
        {!isLoading && (data ?? []).slice(0, 20).map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-md border border-border/40 p-3"
          >
            <div className="text-sm">
              <div className="font-medium">{item.email}</div>
              <div className="text-xs text-muted-foreground">
                Attempts {item.attempts} · Created{" "}
                {new Date(item.created_at).toLocaleString()}
              </div>
              {item.last_attempt_at && (
                <div className="text-xs text-muted-foreground">
                  Last attempt {new Date(item.last_attempt_at).toLocaleString()}
                </div>
              )}
            </div>
            <Badge variant={statusVariant[item.status]}>
              {item.status}
            </Badge>
          </div>
        ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="text-sm text-muted-foreground">
            Reverify queue is clear.
          </div>
        )}
      </CardContent>
    </Card>
  );
}



