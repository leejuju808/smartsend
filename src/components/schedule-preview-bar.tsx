"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PreviewRow = {
  i: number;
  start_utc: string;
  end_utc: string;
  local_date: string;
  tz: string;
};

type DisplayRow = PreviewRow & {
  leadLocal: string;
  myLocal: string;
  s: Date;
  e: Date;
};

export function SchedulePreviewBar({
  campaignId,
  leadId,
  leadTz,
  myTz,
}: {
  campaignId: string;
  leadId: string;
  leadTz?: string | null;
  myTz?: string | null;
}) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [n, setN] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedMyTz = useMemo(
    () => myTz || Intl.DateTimeFormat().resolvedOptions().timeZone,
    [myTz]
  );

  async function load() {
    if (!campaignId || !leadId) {
      setRows([]);
      setError("Missing campaign or lead");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/functions/v1/schedule-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          lead_id: leadId,
          n: Number(n),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? res.statusText);
      }

      setRows(Array.isArray(json.windows) ? json.windows : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRows([]);
      setError(message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, leadId, n]);

  const items = useMemo<DisplayRow[]>(() => {
    return rows.map((row) => {
      const s = new Date(row.start_utc);
      const e = new Date(row.end_utc);
      const leadZone = leadTz || row.tz;
      const leadLocal = s.toLocaleString("en-US", {
        timeZone: leadZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const myLocal = resolvedMyTz
        ? s.toLocaleString("en-US", {
            timeZone: resolvedMyTz,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      return { ...row, leadLocal, myLocal, s, e };
    });
  }, [rows, leadTz, resolvedMyTz]);

  return (
    <div className="rounded-2xl border p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Send Schedule Preview</div>
        <div className="flex items-center gap-2">
          <Select value={n} onValueChange={setN}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Count" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Next 3</SelectItem>
              <SelectItem value="5">Next 5</SelectItem>
              <SelectItem value="10">Next 10</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? <div className="text-xs text-red-500">{error}</div> : null}

      <div className="space-y-1 text-xs">
        {items.map((row) => (
          <div key={row.i} className="flex items-center justify-between p-2 rounded-xl border">
            <div>
              <div className="font-medium">
                {row.leadLocal} ({leadTz || row.tz})
              </div>
              <div className="text-muted-foreground">
                me: {row.myLocal || "—"} {resolvedMyTz ? `(${resolvedMyTz})` : ""}
              </div>
            </div>
            <div className="opacity-60">
              {row.s.toISOString().replace("T", " ").slice(0, 16)}Z → {row.e.toISOString().replace("T", " ").slice(11, 16)}Z
            </div>
          </div>
        ))}
        {!items.length && !error ? (
          <div className="text-muted-foreground">No upcoming windows (check business days / holidays).</div>
        ) : null}
      </div>
    </div>
  );
}


