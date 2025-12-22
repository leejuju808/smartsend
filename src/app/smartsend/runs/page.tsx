"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  created_at: string;
  contact_email: string;
  status: "queued" | "sent" | "failed" | "canceled" | "replied";
  run_at: string;
  sent_at: string | null;
  last_error: string | null;
  provider: string | null;
  provider_message_id: string | null;
  replied_at?: string | null;
  reply_from?: string | null;
  reply_subject?: string | null;
  sequence_steps_new?: { template_subject: string } | null;
};

export default function RunsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  async function fetchRows(reset = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (q) params.set("q", q);
      params.set("limit", "25");
      if (!reset && cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/smartsend/jobs?${params.toString()}`);
      const data = await res.json();
      if (reset) setRows(data.rows || []);
      else setRows((prev) => [...prev, ...(data.rows || [])]);
      setCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCursor(null);
    fetchRows(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  async function action(id: string, kind: "retry" | "cancel") {
    await fetch("/api/smartsend/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: kind }),
    });
    // refresh
    setCursor(null);
    fetchRows(true);
  }

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto text-white">
      <h1 className="text-2xl font-semibold mb-2">SmartSend Runs</h1>
      <p className="text-sm text-zinc-400 mb-6">Queued, sent, failed jobs with quick actions.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email or subject"
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 outline-none"
        >
          <option value="all">All</option>
          <option value="queued">Queued</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
          <option value="failed">Failed</option>
          <option value="canceled">Canceled</option>
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(true)}
            className="rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60">
            <tr className="text-left">
              <th className="p-3">When</th>
              <th className="p-3">Run at</th>
              <th className="p-3">Email</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Status</th>
              <th className="p-3">Reply</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Actions</th>
              <th className="p-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800 align-top">
                <td className="p-3 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {new Date(r.run_at).toLocaleString()}
                </td>
                <td className="p-3">{r.contact_email}</td>
                <td className="p-3">{r.sequence_steps_new?.template_subject || "—"}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded-lg text-xs ${
                      r.status === "sent"
                        ? "bg-green-400/20 text-green-300"
                        : r.status === "replied"
                        ? "bg-blue-400/20 text-blue-300"
                        : r.status === "failed"
                        ? "bg-red-400/20 text-red-300"
                        : r.status === "queued"
                        ? "bg-yellow-400/20 text-yellow-300"
                        : "bg-zinc-400/20 text-zinc-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="p-3">
                  {r.replied_at ? (
                    <div className="text-green-300 text-xs">
                      Yes — {new Date(r.replied_at).toLocaleString()}
                      {r.reply_from ? <div className="text-zinc-400">{r.reply_from}</div> : null}
                      {r.reply_subject ? <div className="text-zinc-500 italic line-clamp-1">{r.reply_subject}</div> : null}
                    </div>
                  ) : (
                    <span className="text-zinc-500 text-xs">—</span>
                  )}
                </td>
                <td className="p-3">
                  {r.provider ? (
                    <span className="text-zinc-300">{r.provider}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3">
                  {r.status === "failed" || r.status === "canceled" ? (
                    <button
                      onClick={() => action(r.id, "retry")}
                      className="rounded-lg bg-yellow-400 text-black px-2 py-1 text-xs mr-2"
                    >
                      Retry
                    </button>
                  ) : r.status === "queued" ? (
                    <button
                      onClick={() => action(r.id, "cancel")}
                      className="rounded-lg bg-zinc-700 text-white px-2 py-1 text-xs"
                    >
                      Cancel
                    </button>
                  ) : (
                    <span className="text-zinc-500 text-xs">—</span>
                  )}
                </td>
                <td className="p-3 max-w-md">
                  <div className="text-zinc-400 whitespace-pre-wrap">
                    {r.last_error || "—"}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td className="p-6 text-center text-zinc-400" colSpan={9}>
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-4">
          <button
            onClick={() => fetchRows(false)}
            className="rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm"
          >
            Load more
          </button>
        </div>
      )}

      {loading && <div className="mt-4 text-sm text-zinc-400">Loading…</div>}
    </div>
  );
}