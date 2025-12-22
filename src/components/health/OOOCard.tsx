"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Item = {
  thread_id: string;
  return_at: string;
};

export default function OOOCard() {
  const { data, mutate, isLoading } = useSWR<Item[]>(
    "/api/ooo",
    (u) => fetch(u).then((r) => r.json()),
  );

  const items = (data ?? []).slice(0, 10);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>OOO Reschedules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </>
        )}
        {!isLoading && items.map((r) => (
          <div
            key={r.thread_id}
            className="flex items-center justify-between gap-3 rounded-md border border-border/40 p-2"
          >
            <div className="text-sm">
              {new Date(r.return_at).toLocaleString()}
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                await fetch(`/api/ooo/${r.thread_id}`, { method: "DELETE" });
                mutate();
              }}
            >
              Resume now
            </Button>
          </div>
        ))}
        {!isLoading && items.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No OOO threads.
          </div>
        )}
      </CardContent>
    </Card>
  );
}



