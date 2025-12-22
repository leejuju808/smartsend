"use client";

import * as React from "react";
import { ChevronDown, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = {
  queue_id: string;
  variant_id: string | null;
  variant_name: string | null;
  scenario: string | null;
  tone: string | null;
  subject: string | null;
  queued_at: string | null;
  sent_at: string | null;
  queue_status: string | null;
  delivery_event: string | null;
  delivery_event_at: string | null;
  reply_label: string | null;
  reply_at: string | null;
};

type ThreadNudgeHistoryProps = {
  threadId: string;
};

export default function ThreadNudgeHistory({
  threadId,
}: ThreadNudgeHistoryProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<Item[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/thread/${threadId}/nudge/history`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();

      if (payload?.ok) {
        setItems(payload.items ?? []);
      } else {
        throw new Error(payload?.error ?? "Unknown error");
      }
    } catch (err) {
      console.error("Failed to load nudge history", err);
      setError("Unable to load nudge history.");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    void load();

    const handleRefresh = () => {
      void load();
    };

    window.addEventListener("thread:flags:refresh", handleRefresh);
    window.addEventListener("inbox:counts:refresh", handleRefresh);

    return () => {
      window.removeEventListener("thread:flags:refresh", handleRefresh);
      window.removeEventListener("inbox:counts:refresh", handleRefresh);
    };
  }, [open, load]);

  return (
    <div className="w-full rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
      >
        <span>Nudge history</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t px-4 py-4 text-sm">
          {loading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="text-destructive">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-muted-foreground">No nudges yet.</div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.queue_id}
                  className="rounded-md border bg-muted/40 p-3 text-xs"
                >
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium">
                      {item.variant_name || item.variant_id || "Variant"}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDate(item.queued_at)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                    <InfoRow label="Scenario" value={item.scenario} />
                    <InfoRow label="Tone" value={item.tone} />
                    <InfoRow label="Status" value={item.queue_status} />
                    <InfoRow label="Sent" value={item.sent_at} isDate />
                    <InfoRow label="Delivery" value={item.delivery_event} />
                    <InfoRow
                      label="Delivery at"
                      value={item.delivery_event_at}
                      isDate
                    />
                    <InfoRow label="Reply" value={item.reply_label} />
                    <InfoRow label="Reply at" value={item.reply_at} isDate />
                  </div>
                  {item.subject ? (
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Subject:</span>{" "}
                      {item.subject}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  isDate = false,
}: {
  label: string;
  value: string | null;
  isDate?: boolean;
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      {isDate ? formatDate(value) : value ?? "—"}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
}


