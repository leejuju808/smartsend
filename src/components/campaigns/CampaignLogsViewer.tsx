"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type Row = {
  id: string;
  created_at: string;
  event?: string | null;
  event_type?: string | null;
  detail?: any;
  details?: any;
  meta?: any;
  lead_id?: string | null;
};

function LabelBadge({ label }: { label?: string | null }) {
  const color = useMemo(() => {
    switch ((label ?? "").toLowerCase()) {
      case "interested":
      case "positive":
      case "human_reply":
        return "bg-green-100 text-green-800 border-green-200";
      case "scheduling":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "not_interested":
      case "negative":
        return "bg-red-100 text-red-800 border-red-200";
      case "unsubscribe":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "ooo":
      case "auto_reply":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-zinc-100 text-zinc-800 border-zinc-200";
    }
  }, [label]);

  if (!label) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
  );
}

export default function CampaignLogsViewer({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const load = useCallback(async (nextPage?: number) => {
    const currentPage = nextPage ?? page;
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, page: currentPage, pageSize: 50 })
      });
      const j = await res.json();
      if (j.ok) {
        setRows(j.rows || []);
        setPage(j.page || currentPage);
        setTotalPages(j.totalPages || 1);
        setTotal(j.total || 0);
      } else {
        setRows([]);
        setTotalPages(1);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId, page]);

  useEffect(() => { load(1); }, [load]);

  if (loading) {
    return <div className="rounded-xl border p-4 text-sm text-neutral-500">Loading logs…</div>;
  }

  return (
    <div className="rounded-xl border">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="font-medium">Campaign Events</div>
        <div className="text-xs opacity-70">Page {page} of {totalPages} • {total} events</div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Event</th>
              <th className="text-left p-2">Lead</th>
              <th className="text-left p-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = (r as any).meta ?? r.detail ?? r.details ?? {};
              const label = meta.label ?? meta.classification ?? meta.intent;
              const reason = meta.reason ?? meta.summary ?? meta.confidence;
              const provider = meta.provider ?? meta.source;
              const event = r.event ?? r.event_type ?? "";
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="font-medium">{event}</span>
                      {event === "reply_classified" && <LabelBadge label={label} />}
                      {event === "reply_detected" && <LabelBadge label={"human_reply"} />}
                    </span>
                  </td>
                  <td className="p-2">{r.lead_id ?? "—"}</td>
                  <td className="p-2">
                    {event === "send_ok" && meta.provider_id && (
                      <span className="opacity-70">provider_id: {meta.provider_id}</span>
                    )}
                    {event === "send_failed" && (
                      <span className="text-red-600">{meta.reason || "failed"}</span>
                    )}
                    {(event === "reply_classified" || event === "reply_detected") && (
                      <span className="opacity-80">{provider ? `via ${provider}; ` : ""}{reason ? `reason: ${reason}` : ""}</span>
                    )}
                    {event === "retry_enqueued" && (
                      <span className="opacity-70">attempt: {meta.attempt}</span>
                    )}
                    {event === "enqueue_initial" && (
                      <span className="opacity-70">count: {meta.count}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between p-3">
        <div className="text-xs opacity-70">Page {page} of {totalPages} • {total} events</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}


