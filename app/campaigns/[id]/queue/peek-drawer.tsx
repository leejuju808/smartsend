"use client";

import { useEffect } from "react";

export default function PeekDrawer({
  open, onClose, row, providerId
}: {
  open: boolean;
  onClose: ()=>void;
  row: any | null;
  providerId?: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !row) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[480px] bg-white dark:bg-zinc-950 border-l p-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Queue Item</h3>
          <button className="text-sm underline underline-offset-2" onClick={onClose}>Close</button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <div className="opacity-60">ID</div><div className="font-mono text-xs break-all">{row.id}</div>
          <div className="opacity-60">Lead ID</div><div className="font-mono text-xs break-all">{row.lead_id}</div>
          <div className="opacity-60">Status</div><div className="capitalize">{row.status}</div>
          <div className="opacity-60">Attempts</div><div>{row.attempts}</div>
          <div className="opacity-60">Variant</div><div>{row.variant_key ?? "-"}</div>
          <div className="opacity-60">Subject</div><div className="truncate">{row.subject ?? "-"}</div>
          <div className="opacity-60">Scheduled</div><div>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : "-"}</div>
          <div className="opacity-60">Next attempt</div><div>{row.next_attempt_at ? new Date(row.next_attempt_at).toLocaleString() : "-"}</div>
          <div className="opacity-60">Fail</div><div>{row.fail_code ? `${row.fail_code} (${row.fail_kind})` : "-"}</div>
          <div className="opacity-60">Created</div><div>{new Date(row.created_at).toLocaleString()}</div>
          <div className="opacity-60">Canceled</div><div>{row.canceled_at ? new Date(row.canceled_at).toLocaleString() : "-"}</div>
        </div>

        {/* Provider ID & copy (if supplied by parent from latest sent log) */}
        {providerId && (
          <div className="mt-4">
            <div className="text-sm opacity-60">Provider ID</div>
            <div className="flex items-center gap-2">
              <code className="text-xs break-all">{providerId}</code>
              <button
                className="rounded-xl border px-2 py-1 text-xs"
                onClick={async () => { await navigator.clipboard.writeText(providerId); }}
              >Copy</button>
            </div>
          </div>
        )}

        {/* Optional: raw meta if you later store small blobs in send_queue.meta */}
        {row.meta && Object.keys(row.meta).length > 0 && (
          <div className="mt-4">
            <div className="text-sm opacity-60">Meta</div>
            <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 whitespace-pre-wrap break-words">{JSON.stringify(row.meta, null, 2)}</pre>
          </div>
        )}

        <div className="mt-6">
          <a
            href={`/campaigns/${row.campaign_id}/lead/${row.lead_id}`}
            className="rounded-xl border px-3 py-2 text-sm inline-block"
          >
            Open Lead Inspector →
          </a>
        </div>
      </aside>
    </div>
  );
}

