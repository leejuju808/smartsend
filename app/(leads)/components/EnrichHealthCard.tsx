"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

type HealthResponse = {
  quotas?: Array<{ source: string; daily_limit: number; used_today: number }>;
  queue?: Array<{ status: string; count: number }>;
};

type Props = {
  showRetry?: boolean;
};

export function EnrichHealthCard({ showRetry = false }: Props = {}) {
  const { toast } = useToast();
  const [data, setData] = React.useState<HealthResponse>({});
  const [loading, setLoading] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/enrich/health");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load enrichment health");
      }
      const json = (await res.json()) as HealthResponse;
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load enrichment health";
      toast({ description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const queueCount = React.useMemo(() => {
    return (data.queue ?? []).reduce<Record<string, number>>((acc, item) => {
      const status = item.status ?? "";
      acc[status] = Number(item.count ?? 0);
      return acc;
    }, {});
  }, [data.queue]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch("/api/enrich/retry-failed", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to bump failed jobs");
      }
      toast({ description: "Failed jobs bumped" });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to bump failed jobs";
      toast({ description: message, variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-4">
        <div>
          Pending: <span className="font-medium">{queueCount.pending ?? 0}</span>
        </div>
        <div>
          Running: <span className="font-medium">{queueCount.running ?? 0}</span>
        </div>
        <div>
          Failed (retrying): <span className="font-medium">{queueCount.failed ?? 0}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {(data.quotas ?? []).map((q) => (
          <div key={q.source} className="opacity-80">
            {q.source}: {q.used_today}/{q.daily_limit}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        {showRetry && (
          <Button size="sm" variant="outline" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry failed now"}
          </Button>
        )}
      </div>
    </Card>
  );
}



