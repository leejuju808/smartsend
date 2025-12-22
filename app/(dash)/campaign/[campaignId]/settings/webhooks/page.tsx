"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Webhook = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  event_types: string[] | null;
};

type Delivery = {
  id: string;
  created_at: string;
  event_id: string;
  attempt: number;
  status: string;
  response_status: number | null;
  response_ms: number | null;
  error: string | null;
};

type DeliveriesResponse = {
  deliveries: Delivery[];
  nextCursor: string | null;
};

type HooksResponse = {
  webhooks: Webhook[];
};

export default function WebhooksPage() {
  const { campaignId } = useParams() as { campaignId: string };
  const [hooks, setHooks] = React.useState<Webhook[]>([]);
  const [selected, setSelected] = React.useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = React.useState<Delivery[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    loadHooks();
  }, [campaignId]);

  async function loadHooks() {
    try {
      const res = await fetch(`/api/campaign/${campaignId}/webhooks`);
      const data: HooksResponse = await res.json();
      setHooks(data.webhooks ?? []);
    } catch {
      setHooks([]);
    }
  }

  async function openHook(h: Webhook) {
    setSelected(h);
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/webhooks/${h.id}/deliveries`);
      const data: DeliveriesResponse = await res.json();
      setDeliveries(data.deliveries ?? []);
      setCursor(data.nextCursor ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!selected || !cursor) return;
    const res = await fetch(
      `/api/campaign/${campaignId}/webhooks/${selected.id}/deliveries?before=${encodeURIComponent(cursor)}`,
    );
    const data: DeliveriesResponse = await res.json();
    setDeliveries((prev) => [...prev, ...(data.deliveries ?? [])]);
    setCursor(data.nextCursor ?? null);
  }

  async function forceRetry(id: string) {
    if (!selected) return;
    await fetch(`/api/campaign/${campaignId}/webhooks/${selected.id}/deliveries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await openHook(selected);
  }

  async function resendLatest() {
    if (!selected) return;
    await fetch(`/api/campaign/${campaignId}/webhooks/${selected.id}/resend-latest`, { method: "POST" });
    await openHook(selected);
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <div className="text-xl font-semibold">Webhooks</div>
        <div className="text-sm text-muted-foreground">
          Monitor deliveries, retry failures, and resend the latest event.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-3">
          <div className="mb-2 text-sm font-semibold">Endpoints</div>
          <div className="space-y-1">
            {hooks.map((h) => (
              <button
                key={h.id}
                onClick={() => openHook(h)}
                className={`w-full rounded-md border p-2 text-left text-xs ${
                  selected?.id === h.id ? "bg-muted" : ""
                }`}
              >
                <div className="font-medium">{h.name}</div>
                <div className="truncate text-muted-foreground">{h.url}</div>
                <div className="mt-1 text-[10px]">
                  {h.enabled ? "Enabled" : "Disabled"} • {h.event_types?.length ?? 0} events
                </div>
              </button>
            ))}
            {!hooks.length && <div className="text-sm text-muted-foreground">No webhooks configured.</div>}
          </div>
        </div>

        <div className="rounded-2xl border p-3 md:col-span-2">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Select a webhook to view deliveries.</div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">{selected.name}</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={resendLatest} disabled={loading}>
                    Resend latest event
                  </Button>
                </div>
              </div>

              <div className="divide-y">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <div className="font-medium">
                        {d.status.toUpperCase()} • try {d.attempt}
                      </div>
                      <div className="text-muted-foreground">
                        {d.response_status ?? "—"} • {d.response_ms ?? "—"} ms • evt {d.event_id}
                      </div>
                      {d.error && <div className="text-red-600">{d.error}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.status !== "success" && (
                        <Button size="sm" variant="outline" onClick={() => forceRetry(d.id)} disabled={loading}>
                          Retry now
                        </Button>
                      )}
                      <span className="text-muted-foreground">
                        {new Date(d.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {!deliveries.length && (
                  <div className="py-6 text-sm text-muted-foreground">No deliveries yet.</div>
                )}
              </div>

              <div className="pt-3">
                {cursor ? (
                  <Button variant="outline" onClick={loadMore} disabled={loading}>
                    Load more
                  </Button>
                ) : (
                  <div className="text-xs text-muted-foreground">End of list.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}




